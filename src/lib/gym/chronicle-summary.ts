import type { Chronicle, TrainingEra } from "./chronicle";

/** How many eras the post-import card lists before it says "and N earlier". */
export const CHRONICLE_SUMMARY_ERAS = 5;

export interface ChronicleSummary {
  /** Full eras, not counting brief returns. */
  eraCount: number;
  /** Single sessions between two layoffs (tone `brief`). */
  briefReturns: number;
  sessions: number;
  firstDate: string;
  lastDate: string;
  layoffs: number;
  prRuns: number;
  /** Newest first, at most CHRONICLE_SUMMARY_ERAS. */
  eras: TrainingEra[];
  /** Eras older than the ones listed. */
  earlier: number;
}

/**
 * What the Chronicle found, in the shape the import wizard's last step shows it. Read straight off
 * `buildChronicle`, so the card and the Chronicle page can never disagree. Undefined with no eras.
 */
export function summariseChronicle(chronicle: Chronicle): ChronicleSummary | undefined {
  const { eras, events } = chronicle;
  if (eras.length === 0) return undefined;
  const newestFirst = [...eras].reverse();
  const shown = newestFirst.slice(0, CHRONICLE_SUMMARY_ERAS);
  return {
    eraCount: eras.filter((era) => era.tone !== "brief").length,
    briefReturns: eras.filter((era) => era.tone === "brief").length,
    sessions: eras.reduce((sum, era) => sum + era.sessions, 0),
    firstDate: eras[0]!.startDate,
    lastDate: eras[eras.length - 1]!.endDate,
    layoffs: events.filter((event) => event.kind === "layoff").length,
    prRuns: events.filter((event) => event.kind === "pr_run").length,
    eras: shown,
    earlier: eras.length - shown.length,
  };
}
