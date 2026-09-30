import type { Exercise, GoalLens, ProgramFile, ProgressionRule } from "@/domain/types";
import { PROGRAM_FILE_VERSION, PROGRAM_FORMAT } from "@/domain/types";
import { exerciseMatcher, exerciseNameKey } from "./engine";
import { resolveStep, type ResolveStep } from "./wizard";

/**
 * Program from text (Opp 11; design in `docs/design/program-from-text.md`, owner's answers recorded there).
 * A fixed grammar turns pasted text into a `lockd-program` v1 file. Same text in, same result out: no
 * model, no network, no guessing. Every line or part of a line it does not use is returned in `unused`
 * with its line number and the reason, and every value the text did not give is returned in `filledIn`.
 * Nothing here writes anything; the screen saves only when the lifter confirms.
 *
 * Grammar (version 1):
 *   Program name   the first non-empty line, when it is not one of the kinds below
 *   Week header    "Week 3"  or  "Week 3: deload"
 *   Session header "Day 1", "Day A", "Session B", each optionally "Day 1: Upper"
 *   Exercise line  name + sets x reps: "Bench Press 3x8", "Squat 3 x 8-12", "Row 4 sets of 6"
 *                  optional "@ RPE 8" (or "@8"), "rest 90s" / "rest 2:00" / "rest 2 min", and a note after
 *                  "|", ";" or " - "
 *   "#" starts a comment; blank and comment-only lines are ignored and not reported
 * Not in version 1: loads ("@ 100 kg", "80%": kept in the row's notes and listed as not used), weeks that
 * differ from each other, supersets ("A1/A2"), spreadsheet columns.
 */

export interface UnusedLine {
  /** 1-based line number in the pasted text. */
  line: number;
  /** The line, or the part of it that was left out. */
  text: string;
  reason: string;
}

export interface FilledIn {
  /** What was not in the text, in words: "Rest between sets". */
  field: string;
  /** What was used instead. */
  value: string;
  /** Where the value came from. */
  source: string;
}

export interface ParsedExercise {
  line: number;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  rpe?: number;
  restSeconds?: number;
  notes?: string;
}

export interface ParsedSession {
  line: number;
  name: string;
  /** True when the text had no Day header, so the name is ours. */
  implicit: boolean;
  exercises: ParsedExercise[];
}

export interface ParsedProgramText {
  /** The name from the first line, or null when the text has none. */
  name: string | null;
  /** Week numbers as headed, in order; empty when the text has no Week header. */
  weeks: Array<{ weekNumber: number; isDeload: boolean }>;
  sessions: ParsedSession[];
  unused: UnusedLine[];
}

const WEEK = /^week\s+(\d{1,3})\s*(?:[:\-–—]?\s*(deload))?\s*$/i;
const SESSION = /^(?:day|session)\s+([a-z0-9]{1,3})\s*(?:[:\-–—]\s*(.+))?$/i;
const SETS_X_REPS = /(\d{1,3})\s*[x×]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?![\d.])/i;
const SETS_OF_REPS = /(\d{1,3})\s*sets?\s*(?:of|x|×)\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?![\d.])/i;
const RPE = /@\s*(?:rpe\s*)?(\d{1,2}(?:\.5)?)(?!\s*(?:kg|lbs?|%|\d))/i;
const REST_CLOCK = /\brest\s*(\d{1,2}):(\d{2})/i;
const REST_TIME = /\brest\s*(\d{1,4})\s*(s|sec|secs|seconds?|m|min|mins|minutes?)?\b/i;
const LOAD = /@?\s*\d+(?:[.,]\d+)?\s*(?:kg|kgs|lbs?|%)/i;
const SUPERSET = /^[a-z]\d\s*[.:)/]/i;

const cleanName = (raw: string) => raw.replace(/^[\s\-*•]+/, "").replace(/[\s:,\-–—|;@]+$/, "").replace(/\s+/g, " ").trim();

/** Reads one exercise line, or says why it cannot. Parts it drops go in `dropped`. */
function parseExercise(
  line: number,
  raw: string,
): { ok: true; exercise: ParsedExercise; dropped: UnusedLine[] } | { ok: false; reason: string } {
  const text = raw.replace(/^[\s\-*•]+/, "");
  if (SUPERSET.test(text)) return { ok: false, reason: "supersets are not read yet" };

  const match = SETS_OF_REPS.exec(text) ?? SETS_X_REPS.exec(text);
  if (!match) return { ok: false, reason: "no sets and reps found (write it like 3x8 or 3x8-12)" };

  const sets = Number(match[1]);
  const repMin = Number(match[2]);
  const repMax = match[3] ? Number(match[3]) : repMin;
  if (sets < 1) return { ok: false, reason: "sets must be at least 1" };
  if (repMin < 1 || repMax < repMin) return { ok: false, reason: "the rep range is not a valid range" };

  const name = cleanName(text.slice(0, match.index));
  if (!name) return { ok: false, reason: "no exercise name before the sets and reps" };
  if (!/[a-z]/i.test(name)) return { ok: false, reason: "no exercise name before the sets and reps" };

  let rest = text.slice(match.index + match[0].length);
  const dropped: UnusedLine[] = [];
  let rpe: number | undefined;
  let restSeconds: number | undefined;
  const noteParts: string[] = [];

  const take = (pattern: RegExp): RegExpExecArray | null => {
    const found = pattern.exec(rest);
    if (found) rest = rest.slice(0, found.index) + " " + rest.slice(found.index + found[0].length);
    return found;
  };

  const load = take(LOAD);
  if (load) {
    const verbatim = load[0].trim();
    noteParts.push(verbatim);
    dropped.push({ line, text: verbatim, reason: "loads are not stored in a program; kept in the row's notes" });
  }
  const rpeMatch = take(RPE);
  if (rpeMatch) {
    const value = Number(rpeMatch[1]);
    if (value >= 1 && value <= 10) rpe = value;
    else dropped.push({ line, text: rpeMatch[0].trim(), reason: "RPE must be between 1 and 10" });
  }
  const clock = take(REST_CLOCK);
  if (clock) {
    restSeconds = Number(clock[1]) * 60 + Number(clock[2]);
  } else {
    const timed = take(REST_TIME);
    if (timed) {
      const unit = (timed[2] ?? "s").toLowerCase();
      restSeconds = Number(timed[1]) * (unit.startsWith("m") ? 60 : 1);
    }
  }

  const leftover = rest.replace(/\s+/g, " ").trim();
  if (leftover) {
    const note = /^(?:\||;|[-–—](?=\s))\s*(.+)$/.exec(leftover);
    if (note) noteParts.push(note[1].trim());
    else dropped.push({ line, text: leftover, reason: "not part of the grammar, so it was left out" });
  }

  return {
    ok: true,
    exercise: {
      line,
      name,
      sets,
      repMin,
      repMax,
      ...(rpe !== undefined ? { rpe } : {}),
      ...(restSeconds !== undefined ? { restSeconds } : {}),
      ...(noteParts.length ? { notes: noteParts.join(" · ") } : {}),
    },
    dropped,
  };
}

const canonical = (exercise: ParsedExercise) =>
  [exerciseNameKey(exercise.name), exercise.sets, exercise.repMin, exercise.repMax, exercise.rpe ?? "", exercise.restSeconds ?? ""].join("|");

/** Reads the pasted text. Pure and deterministic. */
export function parseProgramText(input: string): ParsedProgramText {
  const lines = input.replace(/\r\n?/g, "\n").replace(/\t/g, " ").split("\n");
  const unused: UnusedLine[] = [];
  const weeks: ParsedProgramText["weeks"] = [];
  let name: string | null = null;
  let sawContent = false;

  type Block = { weekNumber: number | null; sessions: ParsedSession[] };
  const blocks: Block[] = [{ weekNumber: null, sessions: [] }];
  const current = () => blocks[blocks.length - 1];
  const currentSession = () => current().sessions[current().sessions.length - 1];

  lines.forEach((full, index) => {
    const line = index + 1;
    const text = full.split("#")[0].trim();
    if (!text) return;

    const week = WEEK.exec(text);
    if (week) {
      sawContent = true;
      const weekNumber = Number(week[1]);
      if (weeks.some((entry) => entry.weekNumber === weekNumber)) {
        unused.push({ line, text, reason: `Week ${weekNumber} is already in the text` });
        return;
      }
      weeks.push({ weekNumber, isDeload: Boolean(week[2]) });
      blocks.push({ weekNumber, sessions: [] });
      return;
    }

    const session = SESSION.exec(text);
    if (session) {
      sawContent = true;
      const label = `Day ${session[1].toUpperCase()}`;
      current().sessions.push({
        line,
        name: session[2] ? cleanName(session[2]) || label : label,
        implicit: false,
        exercises: [],
      });
      return;
    }

    const exercise = parseExercise(line, text);
    if (exercise.ok) {
      sawContent = true;
      if (!currentSession()) current().sessions.push({ line, name: "Day 1", implicit: true, exercises: [] });
      currentSession().exercises.push(exercise.exercise);
      unused.push(...exercise.dropped);
      return;
    }

    if (!sawContent && name === null && !/\d\s*[x×]/i.test(text)) {
      name = cleanName(text) || null;
      sawContent = true;
      return;
    }
    sawContent = true;
    unused.push({ line, text, reason: exercise.reason });
  });

  // Weeks: the first block with sessions is the program. A later week that says the same is just a week; a
  // week that differs cannot be held (sessions repeat every week), so its differing lines are listed.
  const withSessions = blocks.filter((block) => block.sessions.some((s) => s.exercises.length > 0));
  const base = withSessions[0];
  const sessions: ParsedSession[] = base ? base.sessions : [];
  if (base) {
    for (const block of withSessions.slice(1)) {
      block.sessions.forEach((session, sessionIndex) => {
        const twin = base.sessions[sessionIndex];
        session.exercises.forEach((exercise, exerciseIndex) => {
          const same = twin && twin.exercises[exerciseIndex] && canonical(twin.exercises[exerciseIndex]) === canonical(exercise);
          if (!same) {
            unused.push({
              line: exercise.line,
              text: `${exercise.name} ${exercise.sets}x${exercise.repMin}${exercise.repMax !== exercise.repMin ? `-${exercise.repMax}` : ""}`,
              reason: `differs from Week ${base.weekNumber ?? 1}; a program repeats the same sessions every week`,
            });
          }
        });
      });
    }
  }
  // A week header with nothing under it before the first sessions still counts as a week.
  unused.sort((a, b) => a.line - b.line);
  return { name, weeks, sessions, unused };
}

export interface ProgramTextDefaults {
  lens: GoalLens;
  /** The lifter's default rest, seconds. */
  restSeconds: number;
  /** The increment a double progression adds, in grams. */
  incrementG: number;
}

export interface BuiltProgramText {
  file: ProgramFile;
  filledIn: FilledIn[];
}

/**
 * The `lockd-program` file for a parse, with the exercise choices applied. `chosen` maps a name as written
 * to the library exercise a person accepted for it; exact matches link on their own; the rest are kept by
 * name and come in unresolved, as any program file does.
 */
export function buildProgramFromText(
  parsed: ParsedProgramText,
  library: readonly Exercise[],
  defaults: ProgramTextDefaults,
  chosen: ReadonlyMap<string, string> = new Map(),
  stamp: string = new Date().toISOString(),
): BuiltProgramText {
  const filledIn: FilledIn[] = [];
  const match = exerciseMatcher(library);
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const rule: ProgressionRule = { kind: "double_progression", incrementG: defaults.incrementG };

  const rows = parsed.sessions.flatMap((session) => session.exercises);
  if (rows.some((row) => row.restSeconds === undefined))
    filledIn.push({
      field: "Rest between sets",
      value: `${defaults.restSeconds} s`,
      source: "your default rest, for every exercise line without a rest",
    });
  if (rows.length > 0) {
    filledIn.push({ field: "Progression", value: "double progression", source: "the Lock'd default; edit it on the program page" });
    filledIn.push({ field: "Warm-up sets", value: "on", source: "the Lock'd default" });
  }
  filledIn.push({ field: "Goal lens", value: "general", source: "the Lock'd default" });
  if (parsed.name === null) filledIn.push({ field: "Program name", value: "Program from text", source: "the text has no name line" });
  if (parsed.weeks.length === 0) filledIn.push({ field: "Weeks", value: "1", source: "the text has no Week header" });
  if (parsed.sessions.some((session) => session.implicit))
    filledIn.push({ field: "Session name", value: "Day 1", source: "the text has no Day header" });

  const weeks = parsed.weeks.length
    ? parsed.weeks.map((week) => ({ weekNumber: week.weekNumber, isDeload: week.isDeload }))
    : [{ weekNumber: 1, isDeload: false }];

  const file: ProgramFile = {
    format: PROGRAM_FORMAT,
    version: PROGRAM_FILE_VERSION,
    exportedAt: stamp,
    program: {
      name: parsed.name ?? "Program from text",
      lens: defaults.lens,
      weekCount: weeks.length,
      isArchived: false,
      origin: "custom",
    },
    weeks,
    sessions: parsed.sessions.map((session, sessionIndex) => ({
      name: session.name,
      order: sessionIndex,
      dayIndex: sessionIndex,
      exercises: session.exercises.map((row, index) => {
        const accepted = chosen.get(exerciseNameKey(row.name));
        const linked = (accepted ? byId.get(accepted) : undefined) ?? match(row.name);
        return {
          exerciseName: linked ? linked.name : row.name,
          exerciseId: linked ? linked.id : "",
          order: index,
          targetSets: row.sets,
          targetRepMin: row.repMin,
          targetRepMax: row.repMax,
          ...(row.rpe !== undefined ? { targetRpe: row.rpe } : {}),
          restSeconds: row.restSeconds ?? defaults.restSeconds,
          includeWarmup: true,
          rule,
          ...(row.notes ? { notes: row.notes } : {}),
        };
      }),
    })),
  };
  return { file, filledIn };
}

/** The exercise names in the text, once each in first-seen order, and how each meets the library. */
export function programTextNames(parsed: ParsedProgramText, library: readonly Exercise[]): { names: string[]; step: ResolveStep } {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const session of parsed.sessions)
    for (const row of session.exercises) {
      const key = exerciseNameKey(row.name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(row.name);
    }
  return { names, step: resolveStep(names, library) };
}
