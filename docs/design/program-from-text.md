# Program from text (Opp 11)

Status: design doc only (Phase 4). No code, no new dependencies and no change to `src/` ship with it.

## Goal

The plan row (`docs/consolidation/PLAN-ADDENDUM.md` § 4, row 11): "Program from text". What exists:
"`lockd-program` v1 JSON import/export; program packs". What it needs: "Deterministic text parser, preview,
confirm, list of unparsed lines". Depends on: "Resolve-exercise matcher from PR 7". Risk: "Silent guesses:
every unparsed line shown". `docs/STATUS.md` § 4 row 11: "Program from text: paste a program or
spreadsheet, get a routine with progression".

In plain terms: the lifter pastes a program as text. Lock'd reads it with fixed rules, shows exactly what it
understood and every line it did not, and only saves after the lifter confirms. No model, no guessing.

## What exists today

- **The format.** `PROGRAM_FORMAT = "lockd-program"` and `PROGRAM_FILE_VERSION = 1` in
  `src/domain/types.ts`. A `ProgramFile` holds `program` (name, notes, `lens`, `weekCount`, `isArchived`,
  `origin`), `weeks` (`weekNumber`, `isDeload`, `notes`) and `sessions` (`name`, `order`, `dayIndex`,
  `exercises`). Each exercise row has `exerciseName`, `exerciseId`, `order`, `targetSets`, optional
  `targetRepMin`, `targetRepMax`, `targetRpe`, required `restSeconds` and `includeWarmup`, optional
  `substitutionOf` and `notes`, and a required `rule` (`ProgressionRule`: `kind` of `double_progression`,
  `linear`, `hold` or `percent_deload`, with optional `incrementG` and `deloadPercent`).
- **Sessions repeat every week.** Sessions belong to the program, not to a week, and a row has no load
  field. Loads come from progression rules and history (`applyProgramLoad` in `src/lib/gym/programs.ts`).
  A text line such as "3x5 @ 100 kg" or "5x5 @ 80%" has no place in v1 for its load.
- **Import path.** `src/routes/programs.tsx` reads a JSON file, checks `format` only and calls
  `importProgram` (store), which calls `importProgramFile` in `src/lib/gym/programs.ts`. That function
  matches names by exact lower-case name, then by the file's id; a row matching neither is kept with
  `unresolvedName` (plan I-33), skipped when a session starts, and picked up later by
  `resolveProgramExercise`. `unresolvedProgramRows` lists them.
- **Export** is `exportProgramFile`; programs are also shared as the `program` share kind via `/s/$id`.
- **Packs.** `PROGRAM_PACKS` in `src/lib/gym/programs.ts` are built-in programs with the same shape.
- **The resolve-exercise matcher** (import work): `exerciseMatcher` in `src/lib/import/engine.ts` (same
  name ignoring case and punctuation, or a library name plus a bracket naming its own equipment),
  `findExerciseCandidates` in `src/lib/import/batch.ts` (word overlap, only suggests; thresholds
  `CANDIDATE_MIN_SCORE` and `CANDIDATE_MIN_WORDS`), and `resolveStep` in `src/lib/import/wizard.ts`, which
  splits names into `matched`, `candidates` (a person decides each) and `fresh`.
- **No text parser exists** in `src/`.

## Design

1. **Output is a `lockd-program` v1 file.** The parser turns text into a `ProgramFile` object plus a list of
   problems. Saving goes through the existing `importProgram` path, so a text program is stored, exported
   and shared exactly like any other.
2. **A pure, deterministic parser** (proposed `src/lib/import/program-text.ts`): same text in, same result
   out, no network, no model. Line by line, after trimming; tabs from a pasted spreadsheet count as spaces.
3. **Line kinds it understands** (the exact grammar is the first open question):
   - Program name: the first non-empty line if it is not another kind.
   - Week header: "Week 3", optionally with "deload".
   - Session header: "Day 1", "Day A", "Session A", optionally followed by a name ("Day 1: Upper").
   - Exercise line: a name followed by sets and reps, "3x8", "3 x 8-12", "4 sets of 6". Optional parts:
     RPE ("@ RPE 8", "@8"), rest ("rest 90s", "rest 2:00"), and a trailing note after a separator.
   - Blank lines and lines starting with a comment mark are ignored and not reported.
4. **Everything else is unparsed.** A line that matches none of the kinds goes in the unparsed list with its
   line number, its text and the reason ("no sets and reps found", "load is not stored in a program").
   A line that parses partly lists the part it dropped. Nothing is dropped without a row in that list.
5. **Exercise names go through `resolveStep`.** Exact and bracket-equipment matches are linked. Candidates
   are shown with their suggestion and need a tap to accept or to keep as a new name. Fresh names are kept
   as `unresolvedName` rows, as `importProgramFile` does today, and are listed.
6. **Preview.** One screen: sessions in order, each row with name (and its match state), sets, reps, RPE and
   rest; a "Filled in, not in your text" line for each default applied; then the unparsed list, always
   visible, with its count in the heading ("3 lines not used"). The lifter can go back and edit the text.
7. **Confirm.** A single "Save program" button. Nothing is written before it. After saving, the program page
   opens, as it does for a JSON import.
8. **Fields the text cannot give.** `restSeconds`, `includeWarmup`, `rule` and `lens` are required in v1. When
   the text lacks them, the value used is shown in the preview as filled in, with where it came from (for
   rest, the lifter's `defaultRestSeconds` is one option). Which defaults to use is an open question.

## Data and storage

- No new stored field is needed if the program is saved as v1 through `importProgram`.
- Integer units only: rest in seconds; any increment in grams through `@/domain/units` with the lifter's
  `WeightUnit`; RPE as the store holds it.
- The pasted text is not stored by default. If the owner wants it kept (for a receipt of where the program
  came from), it is an optional `Program` field added in `src/domain/types.ts`, `src/lib/backup/schema.ts`
  and the program export, with an old-format fixture and a round-trip test.
- The route's JSON import should validate the file against a schema before import; that is noted here, not
  changed.

## Principles check

- **Logging speed:** unaffected; this is a setup screen.
- **History as the source of truth:** a program only plans sessions; loads still come from history and rules.
- **Number honesty:** no guessed exercise, no guessed number; every default is labelled; every unused line
  is listed. The parser is deterministic and tested with fixtures, not replaced by a chatbot.
- **Guest and offline:** runs entirely on the device; no account.
- **One codebase:** pure TypeScript in the shared app.
- **Brand:** copy says "Lock'd"; source apps are not named.

## Open questions for the owner

1. The exact grammar for version 1: which set and rep shapes, which header words, which comment mark.
2. Loads in text ("@ 100 kg", "@ 80%"): list as unused, keep verbatim in the row's notes, or wait for a v2
   format with a load field?
3. Different sessions per week (week 1 differs from week 2): v1 cannot hold that. List as unused, or plan v2?
4. Defaults when the text is silent: which progression rule, whether warm-ups are on, which lens, and whether
   rest uses `defaultRestSeconds`.
5. Should a spreadsheet paste get its own column-based mode, or only the line grammar?
6. Keep the pasted text with the program?
7. Supersets written in text ("A1/A2"): in scope for v1?

## Out of scope

- Any code (this is a design doc).
- A model or chatbot reading the text, or any fuzzy guess that is applied without a tap.
- Reading PDFs or images.
- Changing the `lockd-program` v1 format; a v2 is a separate decision and migration.
