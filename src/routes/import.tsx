import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BulkClassify } from "@/components/app/bulk-classify";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { weightUnitFor, type WeightUnit } from "@/domain/units";
import { useGym, type ImportSummary } from "@/lib/gym/store";
import { storedFingerprints } from "@/lib/import/batch";
import { parseCsv } from "@/lib/import/csv";
import {
  analyseCsv,
  FIELD_LABELS,
  type ColumnMapping,
  type ImportAnalysis,
  type ImportField,
  type SourceProfile,
} from "@/lib/import/engine";
import { parseJsonInput } from "@/lib/import/foreign";
import { GENERIC_PROFILE } from "@/lib/import/generic";
import { HEVY_PROFILE } from "@/lib/import/hevy";
import { isKnurlVault, KNURL_SOURCE, readKnurlVault } from "@/lib/import/knurl";
import { readRepforgeBackup, REPFORGE_SOURCE } from "@/lib/import/repforge";
import { STRONG_PROFILE } from "@/lib/import/strong";
import { describeImport } from "@/lib/import/summary";
import {
  defaultSelection,
  exerciseNames,
  nameOverridesFrom,
  resolveStep,
  sessionRows,
} from "@/lib/import/wizard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/import")({ component: ImportPage });

type Kind = "strong" | "hevy" | "csv" | "backup";
type Step = "pick" | "map" | "sessions" | "resolve" | "confirm" | "done";

const KINDS: Array<{ id: Kind; label: string; hint: string; accept: string }> = [
  {
    id: "strong",
    label: "Strong CSV",
    hint: "The file the Strong app exports",
    accept: ".csv,text/csv",
  },
  { id: "hevy", label: "Hevy CSV", hint: "The file the Hevy app exports", accept: ".csv,text/csv" },
  {
    id: "csv",
    label: "Another CSV",
    hint: "Any spreadsheet of sets; you choose the columns",
    accept: ".csv,text/csv",
  },
  {
    id: "backup",
    label: "Backup from another app",
    hint: "A JSON backup file",
    accept: ".json,application/json",
  },
];

const PROFILES: Record<Exclude<Kind, "backup">, SourceProfile> = {
  strong: STRONG_PROFILE,
  hevy: HEVY_PROFILE,
  csv: GENERIC_PROFILE,
};

const FIELD_ORDER: ImportField[] = [
  "date",
  "exerciseName",
  "workoutName",
  "setOrder",
  "setType",
  "weight",
  "reps",
  "distance",
  "seconds",
  "rpe",
  "endTime",
  "duration",
  "setNotes",
  "workoutNotes",
  "exerciseNotes",
  "superset",
];

const selectClass =
  "h-11 w-full rounded-xl bg-raised px-3 text-sm text-ink hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";

function ImportPage() {
  const settings = useGym((s) => s.settings);
  const exercises = useGym((s) => s.exercises);
  const importPrepared = useGym((s) => s.importPrepared);

  const [step, setStep] = useState<Step>("pick");
  const [kind, setKind] = useState<Kind>("strong");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [weightUnit, setWeightUnit] = useState<"auto" | WeightUnit>("auto");
  const [distanceUnit, setDistanceUnit] = useState<"auto" | "m" | "km" | "mi">("auto");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [confirmed, setConfirmed] = useState<Map<string, string>>(new Map());
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const isCsv = kind !== "backup";
  const fallbackUnit = weightUnitFor(settings.unitSystem);

  // A backup is read once; a CSV is read again whenever the columns or units change.
  const read = useMemo((): {
    analysis: ImportAnalysis | null;
    source: Pick<SourceProfile, "id" | "label">;
    notes: string[];
    errors: string[] | null;
  } => {
    if (!text) {
      return { analysis: null, source: STRONG_PROFILE, notes: [], errors: null };
    }
    if (isCsv) {
      const profile = PROFILES[kind as Exclude<Kind, "backup">];
      return {
        analysis: analyseCsv(text, profile, {
          mapping: Object.keys(mapping).length ? mapping : undefined,
          unit: fallbackUnit,
          chosenUnit: weightUnit === "auto" ? undefined : weightUnit,
          chosenDistanceUnit: distanceUnit === "auto" ? undefined : distanceUnit,
        }),
        source: profile,
        notes: [],
        errors: null,
      };
    }
    const json = parseJsonInput(text);
    if (!json.ok)
      return { analysis: null, source: REPFORGE_SOURCE, notes: [], errors: json.errors };
    const knurl = isKnurlVault(json.value);
    const result = knurl ? readKnurlVault(json.value) : readRepforgeBackup(json.value);
    if (!result.ok)
      return { analysis: null, source: REPFORGE_SOURCE, notes: [], errors: result.errors };
    return {
      analysis: result.analysis,
      source: knurl ? KNURL_SOURCE : REPFORGE_SOURCE,
      notes: result.notes,
      errors: null,
    };
  }, [text, isCsv, kind, mapping, weightUnit, distanceUnit, fallbackUnit]);
  const analysis = read.analysis;

  const existingFingerprints = useMemo(
    () => (step === "pick" ? new Set<string>() : storedFingerprints(useGym.getState())),
    // Recomputed on entering a step: the log does not change while the wizard is open.
    [step],
  );
  const rows = useMemo(
    () => (analysis ? sessionRows(analysis, existingFingerprints) : []),
    [analysis, existingFingerprints],
  );

  const names = useMemo(
    () => (analysis ? exerciseNames(analysis, selected) : []),
    [analysis, selected],
  );
  const resolve = useMemo(() => resolveStep(names, exercises), [names, exercises]);

  const onFile = async (file: File) => {
    const contents = await file.text();
    setFileName(file.name);
    setText(contents);
    setProblems(null);
    setMapping({});
    setWeightUnit("auto");
    setDistanceUnit("auto");
    setConfirmed(new Map());
    setSummary(null);
    if (kind === "backup") {
      const json = parseJsonInput(contents);
      const result = !json.ok
        ? json
        : isKnurlVault(json.value)
          ? readKnurlVault(json.value)
          : readRepforgeBackup(json.value);
      if (!result.ok) {
        setProblems(result.errors);
        return;
      }
      begin(result.analysis);
      setStep("sessions");
      return;
    }
    setStep("map");
  };

  /** Starting choices for the sessions step: everything that is not already in the log. */
  const begin = (next: ImportAnalysis) => {
    const fingerprints = storedFingerprints(useGym.getState());
    const start = defaultSelection(sessionRows(next, fingerprints));
    for (const template of next.templates ?? []) start.add(template.key);
    setSelected(start);
    setAllowDuplicates(false);
  };

  const toSessions = () => {
    if (!analysis) return;
    begin(analysis);
    setStep("sessions");
  };

  const finish = () => {
    if (!analysis) return;
    setSummary(
      importPrepared({
        analysis,
        source: read.source,
        fileName,
        selectedKeys: selected,
        allowDuplicates,
        nameOverrides: nameOverridesFrom(confirmed),
        notes: read.notes,
      }),
    );
    setStep("done");
  };

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedSessions = rows.filter((row) => selected.has(row.key));
  const totalSets = selectedSessions.reduce((sum, row) => sum + row.workout.setCount, 0);
  const routinesSelected = (analysis?.templates ?? []).filter((t) => selected.has(t.key)).length;
  const newNames = [
    ...resolve.fresh,
    ...resolve.candidates
      .filter((candidate) => !confirmed.has(candidate.name))
      .map((candidate) => candidate.name),
  ];

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Import your history</h1>
      <p className="mt-1 text-sm text-muted">
        Nothing is added until the last step. Sessions already in your log are recognised and left
        out.
      </p>

      {step === "pick" ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">Where is it from?</h2>
          <div className="mt-3 space-y-2">
            {KINDS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setKind(entry.id)}
                className={cn(
                  "block w-full rounded-xl p-3 text-left",
                  kind === entry.id ? "bg-accent text-accent-ink" : "bg-raised",
                )}
                data-testid={`import-kind-${entry.id}`}
              >
                <span className="block text-sm font-medium">{entry.label}</span>
                <span className="block text-xs opacity-80">{entry.hint}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs text-subtle">Choose the file</span>
            <input
              type="file"
              accept={KINDS.find((entry) => entry.id === kind)?.accept}
              data-testid="import-file"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void onFile(file);
              }}
            />
          </label>
          {problems ? (
            <div
              role="alert"
              data-testid="import-problems"
              className="mt-3 rounded-xl bg-raised p-3 text-xs text-muted"
            >
              <p className="font-medium text-ink">That file can’t be imported:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {problems.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {step === "map" && analysis ? (
        <MapStep
          text={text}
          analysis={analysis}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          onMapping={(field, column) =>
            setMapping((current) => {
              // An explicit undefined means "not in this file", and beats the automatic guess.
              return { ...current, ...analysis.mapping, [field]: column };
            })
          }
          onWeightUnit={setWeightUnit}
          onDistanceUnit={setDistanceUnit}
          onBack={() => setStep("pick")}
          onNext={toSessions}
        />
      ) : null}

      {step === "sessions" && analysis ? (
        <Card className="mt-4" data-testid="import-sessions">
          <h2 className="font-display text-xl font-semibold tracking-tight">Sessions</h2>
          <p className="mt-1 text-sm text-muted">
            {rows.length} in the file
            {rows.some((row) => row.alreadyHere)
              ? `, ${rows.filter((row) => row.alreadyHere).length} already in your log`
              : ""}
            . Untick any you do not want.
          </p>
          {analysis.issues.length > 0 ? (
            <details className="mt-3 rounded-xl bg-raised p-3 text-xs text-muted">
              <summary className="cursor-pointer text-ink">
                {analysis.issues.length} thing{analysis.issues.length === 1 ? "" : "s"} to know
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {analysis.issues.slice(0, 12).map((issue, index) => (
                  <li key={`${issue.row}-${index}`}>
                    {issue.row ? `Row ${issue.row}: ` : ""}
                    {issue.message}
                  </li>
                ))}
                {analysis.issues.length > 12 ? (
                  <li>…and {analysis.issues.length - 12} more.</li>
                ) : null}
              </ul>
            </details>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSelected(new Set(rows.filter((row) => !row.alreadyHere).map((row) => row.key)))
              }
            >
              New only
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(rows.map((row) => row.key)))}
            >
              All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              None
            </Button>
          </div>
          <ul className="mt-3 max-h-96 divide-y divide-line overflow-y-auto">
            {rows.map((row) => (
              <li key={row.key}>
                <label className="flex min-h-14 items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={selected.has(row.key)}
                    onChange={() => toggle(row.key)}
                    aria-label={`${row.workout.name} on ${row.workout.localDate}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.workout.name}</span>
                    <span className="block text-xs text-muted">
                      {row.workout.localDate} · {row.workout.exercises.length} exercises ·{" "}
                      {row.workout.setCount} sets
                    </span>
                  </span>
                  {row.alreadyHere ? (
                    <span className="shrink-0 rounded-full bg-raised px-2 py-1 text-[11px] text-subtle">
                      Already here
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
          {(analysis.templates ?? []).length > 0 ? (
            <>
              <h3 className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-subtle">
                Routines
              </h3>
              <ul className="mt-1 divide-y divide-line">
                {(analysis.templates ?? []).map((template) => (
                  <li key={template.key}>
                    <label className="flex min-h-12 items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={selected.has(template.key)}
                        onChange={() => toggle(template.key)}
                        aria-label={`Routine ${template.name}`}
                      />
                      <span className="text-sm">{template.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {(analysis.measurements ?? []).length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {(analysis.measurements ?? []).length} body measurements will be added; ones already
              recorded are skipped.
            </p>
          ) : null}
          {rows.some((row) => row.alreadyHere) ? (
            <label className="mt-3 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="size-4"
                checked={allowDuplicates}
                onChange={(event) => setAllowDuplicates(event.target.checked)}
              />
              Import ticked sessions even if they are already in the log (this adds a second copy)
            </label>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(isCsv ? "map" : "pick")}>
              Back
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={selectedSessions.length + routinesSelected === 0}
              data-testid="import-next-resolve"
              onClick={() => setStep("resolve")}
            >
              Next: exercises
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "resolve" && analysis ? (
        <Card className="mt-4" data-testid="import-resolve">
          <h2 className="font-display text-xl font-semibold tracking-tight">Exercises</h2>
          <p className="mt-1 text-sm text-muted">
            {resolve.matched.length} match an exercise you already have by name. Nothing is merged
            unless the name is the same or you say so here.
          </p>
          {resolve.candidates.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {resolve.candidates.map((candidate) => {
                const same = confirmed.get(candidate.name) === candidate.exercise.id;
                return (
                  <li key={candidate.name} className="rounded-xl bg-raised p-3">
                    <p className="text-sm">
                      <span className="font-medium">{candidate.name}</span> looks like{" "}
                      <span className="font-medium">{candidate.exercise.name}</span>.
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={same}
                        className={cn(
                          "h-11 rounded-xl text-sm",
                          same ? "bg-accent text-accent-ink" : "bg-canvas hairline",
                        )}
                        onClick={() =>
                          setConfirmed((current) =>
                            new Map(current).set(candidate.name, candidate.exercise.id),
                          )
                        }
                      >
                        Same exercise
                      </button>
                      <button
                        type="button"
                        aria-pressed={!same}
                        className={cn(
                          "h-11 rounded-xl text-sm",
                          !same ? "bg-accent text-accent-ink" : "bg-canvas hairline",
                        )}
                        onClick={() =>
                          setConfirmed((current) => {
                            const next = new Map(current);
                            next.delete(candidate.name);
                            return next;
                          })
                        }
                      >
                        Different, add as new
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {resolve.fresh.length > 0 ? (
            <details className="mt-3 rounded-xl bg-raised p-3 text-xs text-muted">
              <summary className="cursor-pointer text-ink">
                {resolve.fresh.length} new exercise{resolve.fresh.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {resolve.fresh.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("sessions")}>
              Back
            </Button>
            <Button
              type="button"
              className="flex-1"
              data-testid="import-next-confirm"
              onClick={() => setStep("confirm")}
            >
              Next: review
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "confirm" && analysis ? (
        <Card className="mt-4" data-testid="import-confirm">
          <h2 className="font-display text-xl font-semibold tracking-tight">Ready to import</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              {selectedSessions.length} session{selectedSessions.length === 1 ? "" : "s"},{" "}
              {totalSets} sets
            </li>
            {routinesSelected > 0 ? (
              <li>{routinesSelected} routines (same-named ones are skipped)</li>
            ) : null}
            {(analysis.measurements ?? []).length > 0 ? (
              <li>
                {(analysis.measurements ?? []).length} measurements (already-recorded ones are
                skipped)
              </li>
            ) : null}
            <li>
              {newNames.length} new exercise{newNames.length === 1 ? "" : "s"}
              {confirmed.size > 0 ? `, ${confirmed.size} merged into ones you have` : ""}
            </li>
          </ul>
          {allowDuplicates ? (
            <p className="mt-2 text-xs text-muted">
              Sessions already in your log will be added again.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted">
            Your existing sessions are not changed. New exercises start with no muscle group; you
            can classify them next.
          </p>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("resolve")}>
              Back
            </Button>
            <Button type="button" className="flex-1" data-testid="import-run" onClick={finish}>
              Import
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "done" && summary ? (
        <>
          <Card className="mt-4" data-testid="import-done">
            <h2 className="font-display text-xl font-semibold tracking-tight">Done</h2>
            <p className="mt-2 text-sm text-muted" data-testid="import-summary">
              {describeImport(summary)}
            </p>
            <div className="mt-3 flex gap-3 text-sm">
              <Link to="/history" className="text-accent underline-offset-2 hover:underline">
                Open history
              </Link>
              <button
                type="button"
                className="text-accent underline-offset-2 hover:underline"
                onClick={() => {
                  setStep("pick");
                  setText("");
                  setFileName("");
                }}
              >
                Import another file
              </button>
            </div>
          </Card>
          <Card className="mt-4">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Classify new exercises
            </h2>
            <div className="mt-2">
              <BulkClassify />
            </div>
          </Card>
        </>
      ) : null}
    </Page>
  );
}

function MapStep({
  text,
  analysis,
  weightUnit,
  distanceUnit,
  onMapping,
  onWeightUnit,
  onDistanceUnit,
  onBack,
  onNext,
}: {
  text: string;
  analysis: ImportAnalysis;
  weightUnit: "auto" | WeightUnit;
  distanceUnit: "auto" | "m" | "km" | "mi";
  onMapping: (field: ImportField, column: number | undefined) => void;
  onWeightUnit: (unit: "auto" | WeightUnit) => void;
  onDistanceUnit: (unit: "auto" | "m" | "km" | "mi") => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const sample = useMemo(() => parseCsv(text).rows.slice(0, 3), [text]);
  const missing = analysis.missingRequired;
  return (
    <Card className="mt-4" data-testid="import-map">
      <h2 className="font-display text-xl font-semibold tracking-tight">Columns</h2>
      <p className="mt-1 text-sm text-muted">
        {analysis.totalRows} rows. Check that each field points at the right column.
      </p>
      <div className="mt-3 space-y-3">
        {FIELD_ORDER.map((field) => {
          const column = analysis.mapping[field];
          const required = field === "date" || field === "exerciseName";
          return (
            <div key={field}>
              <label className="mb-1 block text-xs text-subtle" htmlFor={`map-${field}`}>
                {FIELD_LABELS[field]}
                {required ? " (required)" : ""}
              </label>
              <select
                id={`map-${field}`}
                className={selectClass}
                value={column ?? ""}
                onChange={(event) =>
                  onMapping(
                    field,
                    event.target.value === "" ? undefined : Number(event.target.value),
                  )
                }
              >
                <option value="">Not in this file</option>
                {analysis.header.map((name, index) => (
                  <option key={`${name}-${index}`} value={index}>
                    {name || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
              {column !== undefined && sample.length > 0 ? (
                <p className="mt-1 truncate text-xs text-muted">
                  e.g.{" "}
                  {sample
                    .map((row) => row[column] ?? "")
                    .filter(Boolean)
                    .join(" · ") || "(blank)"}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-subtle" htmlFor="map-weight-unit">
            Weight unit
            {analysis.detectedUnit
              ? ` (file says ${analysis.detectedUnit})`
              : " (file does not say)"}
          </label>
          <select
            id="map-weight-unit"
            className={selectClass}
            value={weightUnit}
            onChange={(event) => onWeightUnit(event.target.value as "auto" | WeightUnit)}
          >
            <option value="auto">Use the file / my setting</option>
            <option value="kg">Kilograms</option>
            <option value="lb">Pounds</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-subtle" htmlFor="map-distance-unit">
            Distance unit
            {analysis.detectedDistanceUnit ? ` (file says ${analysis.detectedDistanceUnit})` : ""}
          </label>
          <select
            id="map-distance-unit"
            className={selectClass}
            value={distanceUnit}
            onChange={(event) => onDistanceUnit(event.target.value as "auto" | "m" | "km" | "mi")}
          >
            <option value="auto">Use the file / metres</option>
            <option value="m">Metres</option>
            <option value="km">Kilometres</option>
            <option value="mi">Miles</option>
          </select>
        </div>
      </div>
      {missing.length > 0 ? (
        <p role="alert" data-testid="import-map-missing" className="mt-3 text-sm text-danger">
          Choose a column for {missing.map((field) => FIELD_LABELS[field]).join(" and ")} to
          continue.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted" data-testid="import-map-ok">
          {analysis.workouts.length} session{analysis.workouts.length === 1 ? "" : "s"} found
          {analysis.skippedRows ? `, ${analysis.skippedRows} rows skipped` : ""}.
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={missing.length > 0 || analysis.workouts.length === 0}
          data-testid="import-next-sessions"
          onClick={onNext}
        >
          Next: sessions
        </Button>
      </div>
    </Card>
  );
}
