import type { ImportSummary } from "@/lib/gym/store";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What an import did, in plain sentences, for Settings and the wizard. */
export function describeImport(summary: ImportSummary): string {
  const parts = [
    count(summary.workouts, "session"),
    count(summary.sets, "set"),
    ...(summary.routines ? [count(summary.routines, "routine")] : []),
    ...(summary.measurements ? [count(summary.measurements, "measurement")] : []),
  ];
  const lines = [
    `Imported ${parts.join(", ")}. Skipped ${count(summary.skipped, "row")}.`,
    summary.duplicates ? `${count(summary.duplicates, "session")} already here and left out.` : "",
    summary.routinesSkipped
      ? `${count(summary.routinesSkipped, "routine")} with the same name already here and left out.`
      : "",
    summary.measurementsSkipped
      ? `${count(summary.measurementsSkipped, "measurement")} already recorded and left out.`
      : "",
    summary.unmatched.length
      ? `New exercises to classify: ${summary.unmatched.slice(0, 8).join(", ")}${summary.unmatched.length > 8 ? ` and ${summary.unmatched.length - 8} more` : ""}.`
      : "",
    ...summary.notes,
    ...summary.issues.slice(0, 3),
    summary.issues.length > 3 ? `(and ${summary.issues.length - 3} more.)` : "",
  ];
  return lines.filter(Boolean).join(" ");
}
