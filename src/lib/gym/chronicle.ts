import { localDateToOrdinal } from "@/domain/time";
import type { EraName, OneRepMaxFormula } from "@/domain/types";
import { hardSetCount } from "@/domain/volume";
import { computeRecords, type PersonalRecord, type SessionSlice } from "./analytics";
import { e1rmSeries } from "./analytics";

export type ChronicleKind =
  "era" | "layoff" | "comeback" | "pr_run" | "exercise_change" | "peak" | "jump" | "block";

export interface ChronicleEvent {
  id: string;
  kind: ChronicleKind;
  startDate: string;
  endDate?: string;
  title: string;
  detail: string;
  exerciseId?: string;
  workoutId?: string;
  magnitude?: number;
}

/** `brief`: a single session between two layoffs. Kept as its own stretch, never folded into a neighbour (owner, 2026-09-30). */
export type EraTone =
  "foundation" | "comeback" | "volume" | "strength" | "peak" | "rebuild" | "brief";

export interface TrainingEra {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  sessions: number;
  hardSets: number;
  tone: EraTone;
  autoName: string;
}

export interface Chronicle {
  eras: TrainingEra[];
  events: ChronicleEvent[];
  current?: TrainingEra;
  strongest?: ChronicleEvent;
  biggestJump?: ChronicleEvent;
}

function seasonOf(date: string): string {
  const month = Number(date.slice(5, 7));
  if (month <= 2 || month === 12) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Autumn";
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * How the Chronicle decides an era boundary and what an era is called. These are product heuristics, not research
 * (catalog claim `era-detection-rules`): each one is a plain ratio against the lifter's own training, so a lifter who does
 * 20 sets a week is not judged against one who does 40.
 */
export const ERA_MIN_SEGMENT_WEEKS = 6;
/** A stretch splits when its weekly hard sets move by this ratio (or its inverse) between two halves. */
export const ERA_VOLUME_SPLIT_RATIO = 1.25;
/** …or when PR stamps per four weeks differ by at least this many. */
export const ERA_PR_RATE_SPLIT = 3;
/** Weeks of history before an era that make up "the lifter's own baseline". */
export const ERA_BASELINE_WEEKS = 26;
/** The old absolute 42 / 38 / 28 sets a week, read against a 35-set baseline. */
export const ERA_VOLUME_RATIO = 1.2;
export const ERA_STRENGTH_MAX_RATIO = 1.1;
export const ERA_REBUILD_RATIO = 0.8;

const DAY = 1;
function weekKey(date: string): number {
  return Math.floor(localDateToOrdinal(date) / 7);
}

/** Hard sets per week the lifter actually trained, over [start, end]. Null with nothing logged. */
function weeklySets(slices: SessionSlice[], start: string, end: string): number | null {
  const inRange = slices.filter(
    (slice) => slice.workout.localDate >= start && slice.workout.localDate <= end,
  );
  if (inRange.length === 0) return null;
  const trained = new Set(inRange.map((slice) => weekKey(slice.workout.localDate)));
  return inRange.reduce((sum, slice) => sum + hardSetCount(slice.sets), 0) / trained.size;
}

/** Weekly hard sets over the ERA_BASELINE_WEEKS before `start`; null when nothing came before. */
function baselineWeeklySets(slices: SessionSlice[], start: string): number | null {
  const from = ordinalDate(localDateToOrdinal(start) - ERA_BASELINE_WEEKS * 7);
  const to = ordinalDate(localDateToOrdinal(start) - DAY);
  return weeklySets(slices, from, to);
}

/**
 * Splits [start, end] at the strongest lasting change: first in weekly volume, else in PR rate. Both sides need
 * ERA_MIN_SEGMENT_WEEKS weeks. Recurses on each side, so a long history can hold several regimes.
 */
function splitRegimes(
  slices: SessionSlice[],
  start: string,
  end: string,
  prCounts: Map<string, number>,
): Array<{ startDate: string; endDate: string }> {
  const startOrd = localDateToOrdinal(start);
  const weekCount = Math.floor((localDateToOrdinal(end) - startOrd + 1) / 7);
  if (weekCount < ERA_MIN_SEGMENT_WEEKS * 2) return [{ startDate: start, endDate: end }];
  const sets = new Array<number>(weekCount).fill(0);
  const prs = new Array<number>(weekCount).fill(0);
  for (const slice of slices) {
    const date = slice.workout.localDate;
    if (date < start || date > end) continue;
    const week = Math.floor((localDateToOrdinal(date) - startOrd) / 7);
    if (week >= weekCount) continue;
    sets[week]! += hardSetCount(slice.sets);
  }
  for (const [date, count] of prCounts) {
    if (date < start || date > end) continue;
    const week = Math.floor((localDateToOrdinal(date) - startOrd) / 7);
    if (week < weekCount) prs[week]! += count;
  }
  const sum = (values: number[], from: number, to: number) =>
    values.slice(from, to).reduce((a, b) => a + b, 0);
  let bestVolume: { week: number; score: number } | undefined;
  let bestPr: { week: number; score: number } | undefined;
  for (let week = ERA_MIN_SEGMENT_WEEKS; week <= weekCount - ERA_MIN_SEGMENT_WEEKS; week += 1) {
    const left = week;
    const right = weekCount - week;
    const leftSets = sum(sets, 0, week) / left;
    const rightSets = sum(sets, week, weekCount) / right;
    if (leftSets > 0 && rightSets > 0) {
      const ratio = rightSets / leftSets;
      if (ratio >= ERA_VOLUME_SPLIT_RATIO || ratio <= 1 / ERA_VOLUME_SPLIT_RATIO) {
        const score = Math.abs(Math.log(ratio));
        if (!bestVolume || score > bestVolume.score) bestVolume = { week, score };
      }
    }
    const prDiff = Math.abs(sum(prs, week, weekCount) / right - sum(prs, 0, week) / left) * 4;
    if (prDiff >= ERA_PR_RATE_SPLIT && (!bestPr || prDiff > bestPr.score))
      bestPr = { week, score: prDiff };
  }
  const chosen = bestVolume ?? bestPr;
  if (!chosen) return [{ startDate: start, endDate: end }];
  const splitOrd = startOrd + chosen.week * 7;
  const dates = slices
    .map((slice) => slice.workout.localDate)
    .filter((date) => date >= start && date <= end);
  const rightStart = dates.find((date) => localDateToOrdinal(date) >= splitOrd);
  const leftEnd = [...dates].reverse().find((date) => localDateToOrdinal(date) < splitOrd);
  if (!rightStart || !leftEnd) return [{ startDate: start, endDate: end }];
  return [
    ...splitRegimes(slices, start, leftEnd, prCounts),
    ...splitRegimes(slices, rightStart, end, prCounts),
  ];
}

function nameEra(args: {
  index: number;
  tone: EraTone;
  startDate: string;
  afterLayoff: boolean;
  total: number;
}): string {
  if (args.index === 0) return "Foundation";
  if (args.tone === "brief") return "Brief Return";
  if (args.afterLayoff && args.tone === "comeback") return "The Return";
  if (args.tone === "volume") return `Volume ${seasonOf(args.startDate)}`;
  if (args.tone === "strength")
    return args.index === args.total - 1 ? "Iron Block" : `Strength ${seasonOf(args.startDate)}`;
  if (args.tone === "peak") return "PR Run";
  if (args.tone === "rebuild") return "The Grind";
  return `${seasonOf(args.startDate)} ${yearOf(args.startDate)}`;
}

function classifyTone(
  slices: SessionSlice[],
  start: string,
  end: string,
  afterLayoff: boolean,
  goalIds: string[],
  formula: OneRepMaxFormula,
  baseline: number | null,
): EraTone {
  if (afterLayoff) return "comeback";
  const inEra = slices.filter(
    (slice) => slice.workout.localDate >= start && slice.workout.localDate <= end,
  );
  if (inEra.length < 4) return afterLayoff ? "comeback" : "rebuild";
  const setsPerWeek = weeklySets(slices, start, end) ?? 0;
  // Against the lifter's own weeks before this era. With no baseline the era is read as an ordinary stretch.
  const ratio = baseline && baseline > 0 ? setsPerWeek / baseline : 1;
  let climb = 0;
  for (const id of goalIds.slice(0, 3)) {
    const series = e1rmSeries(id, inEra, formula);
    if (series.length < 2) continue;
    const first = series[0]!.value;
    const last = series[series.length - 1]!.value;
    if (first > 0) climb += (last - first) / first;
  }
  const climbAvg = goalIds.length ? climb / Math.min(3, Math.max(1, goalIds.length)) : 0;
  if (ratio >= ERA_VOLUME_RATIO && climbAvg < 0.08) return "volume";
  if (climbAvg >= 0.08 && ratio < ERA_STRENGTH_MAX_RATIO) return "strength";
  if (climbAvg >= 0.12) return "peak";
  if (ratio < ERA_REBUILD_RATIO) return "rebuild";
  return afterLayoff ? "comeback" : "foundation";
}

export function buildChronicle(
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
  goalIds: string[],
  eraNames: EraName[] = [],
): Chronicle {
  if (slices.length === 0) {
    return { eras: [], events: [] };
  }

  const events: ChronicleEvent[] = [];
  const gaps: Array<{ start: string; end: string; days: number; after: string; before: string }> =
    [];
  for (let i = 1; i < slices.length; i += 1) {
    const prev = slices[i - 1]!.workout.localDate;
    const next = slices[i]!.workout.localDate;
    const days = localDateToOrdinal(next) - localDateToOrdinal(prev);
    if (days >= 14) {
      gaps.push({ start: prev, end: next, days, after: prev, before: next });
      events.push({
        id: `layoff-${prev}`,
        kind: "layoff",
        startDate: prev,
        endDate: next,
        title: `${days}-day layoff`,
        detail: `Nothing logged between ${prev} and ${next}.`,
        magnitude: days,
      });
      events.push({
        id: `comeback-${next}`,
        kind: "comeback",
        startDate: next,
        title: "Comeback",
        detail: `${slices[i]!.workout.name} reopened the file after ${days} days.`,
        workoutId: slices[i]!.workout.id,
      });
    }
  }

  const firstDate = slices[0]!.workout.localDate;
  const lastDate = slices[slices.length - 1]!.workout.localDate;

  // Boundaries come from the log alone: the start, and the first session after each layoff. A name is a label for an
  // era that starts on its date; it never decides where eras begin (naming one era used to delete all the others).
  const uniqueStarts = [...new Set([firstDate, ...gaps.map((gap) => gap.before)])].sort();

  const rawEras: Array<{ startDate: string; endDate: string; afterLayoff: boolean }> = [];
  for (let i = 0; i < uniqueStarts.length; i += 1) {
    const start = uniqueStarts[i]!;
    const nextStart = uniqueStarts[i + 1];
    const end = nextStart
      ? slices
          .filter(
            (slice) => slice.workout.localDate >= start && slice.workout.localDate < nextStart,
          )
          .at(-1)?.workout.localDate
      : lastDate;
    if (!end || end < start) continue;
    const afterLayoff = gaps.some((gap) => gap.before === start);
    rawEras.push({ startDate: start, endDate: end, afterLayoff });
  }

  const records = computeRecords(slices, formula, true).filter((row) => row.kind === "e1rm");
  const prsByDate = new Map<string, PersonalRecord[]>();
  const running = new Map<string, number>();
  for (const slice of slices) {
    for (const exercise of slice.exercises) {
      const seriesPoint = e1rmSeries(exercise.exerciseId, [slice], formula)[0];
      if (!seriesPoint) continue;
      const prev = running.get(exercise.exerciseId);
      if (prev === undefined) {
        // First time on file is the baseline, not a PR.
        running.set(exercise.exerciseId, seriesPoint.value);
      } else if (seriesPoint.value > prev) {
        const pr: PersonalRecord = {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseNameSnapshot,
          kind: "e1rm",
          value: seriesPoint.value,
          date: slice.workout.localDate,
          workoutId: slice.workout.id,
        };
        const list = prsByDate.get(slice.workout.localDate) ?? [];
        list.push(pr);
        prsByDate.set(slice.workout.localDate, list);
        running.set(exercise.exerciseId, seriesPoint.value);
      }
    }
  }

  // Split long stretches where the training itself changed: a lasting shift in weekly volume, or in how often PRs land.
  const prCounts = new Map([...prsByDate].map(([date, list]) => [date, list.length]));
  const expanded: typeof rawEras = [];
  for (const era of rawEras) {
    const parts = splitRegimes(slices, era.startDate, era.endDate, prCounts);
    parts.forEach((part, index) =>
      expanded.push({ ...part, afterLayoff: index === 0 ? era.afterLayoff : false }),
    );
  }

  // What "a lot of volume" means is the lifter's own: each era's weekly sets are read against the weeks trained before it.
  const overallWeekly = weeklySets(slices, firstDate, lastDate);
  const autoNameUses = new Map<string, number>();
  const eras: TrainingEra[] = expanded
    .map((era, index) => {
      const inEra = slices.filter(
        (slice) =>
          slice.workout.localDate >= era.startDate && slice.workout.localDate <= era.endDate,
      );
      const baseline = baselineWeeklySets(slices, era.startDate) ?? overallWeekly;
      // One session with a layoff on each side: the lifter came back once and stopped again. It stays its own stretch
      // so the record does not look more continuous than it was, but it is named for what it is, not as a full era.
      const brief =
        inEra.length === 1 && era.afterLayoff && Boolean(expanded[index + 1]?.afterLayoff);
      const tone: EraTone = brief ? "brief" : classifyTone(
        slices,
        era.startDate,
        era.endDate,
        era.afterLayoff,
        goalIds,
        formula,
        baseline,
      );
      const baseName = nameEra({
        index,
        tone: index === 0 ? "foundation" : tone,
        startDate: era.startDate,
        afterLayoff: era.afterLayoff,
        total: expanded.length,
      });
      // Two eras that would share a name (two summers in a row) are told apart, not left identical.
      const uses = (autoNameUses.get(baseName) ?? 0) + 1;
      autoNameUses.set(baseName, uses);
      const autoName = uses === 1 ? baseName : `${baseName} · ${uses}`;
      const override = eraNames.find((row) => row.startDate === era.startDate)?.name;
      return {
        id: `era-${era.startDate}`,
        name: override || autoName,
        autoName,
        startDate: era.startDate,
        endDate: era.endDate,
        sessions: inEra.length,
        hardSets: inEra.reduce((sum, slice) => sum + hardSetCount(slice.sets), 0),
        tone: index === 0 ? "foundation" : tone,
      };
    })
    .filter((era) => era.sessions > 0);

  for (const era of eras) {
    events.push({
      id: era.id,
      kind: "era",
      startDate: era.startDate,
      endDate: era.endDate,
      title: era.name,
      detail: `${era.sessions} sessions · ${era.hardSets} hard sets.`,
    });
  }

  const prDates = [...prsByDate.keys()].sort();
  let runStart: string | null = null;
  let runCount = 0;
  let runEnd: string | null = null;
  const flushRun = () => {
    if (runStart && runCount >= 3) {
      events.push({
        id: `prrun-${runStart}`,
        kind: "pr_run",
        startDate: runStart,
        endDate: runEnd ?? runStart,
        title: "PR run",
        detail: `${runCount} estimated 1RM stamps in a tight window.`,
        magnitude: runCount,
      });
    }
  };
  for (let i = 0; i < prDates.length; i += 1) {
    const date = prDates[i]!;
    const count = prsByDate.get(date)?.length ?? 0;
    if (!runStart) {
      runStart = date;
      runEnd = date;
      runCount = count;
      continue;
    }
    const gap = localDateToOrdinal(date) - localDateToOrdinal(runEnd!);
    if (gap <= 21) {
      runEnd = date;
      runCount += count;
    } else {
      flushRun();
      runStart = date;
      runEnd = date;
      runCount = count;
    }
  }
  flushRun();

  const seen = new Set<string>();
  for (const slice of slices) {
    for (const exercise of slice.exercises) {
      if (seen.has(exercise.exerciseId)) continue;
      seen.add(exercise.exerciseId);
      if (slice !== slices[0]) {
        events.push({
          id: `new-${exercise.exerciseId}-${slice.workout.localDate}`,
          kind: "exercise_change",
          startDate: slice.workout.localDate,
          title: `First ${exercise.exerciseNameSnapshot}`,
          detail: "New lift enters the log.",
          exerciseId: exercise.exerciseId,
          workoutId: slice.workout.id,
        });
      }
    }
  }

  let strongest: ChronicleEvent | undefined;
  let bestScore = 0;
  if (goalIds.length && slices.length >= 8) {
    const startOrd = localDateToOrdinal(slices[0]!.workout.localDate);
    const endOrd = localDateToOrdinal(slices[slices.length - 1]!.workout.localDate);
    for (let ord = startOrd; ord <= endOrd - 21; ord += 7) {
      const start = ordinalDate(ord);
      const end = ordinalDate(ord + 27);
      const window = slices.filter(
        (slice) => slice.workout.localDate >= start && slice.workout.localDate <= end,
      );
      if (window.length < 4) continue;
      let score = 0;
      for (const id of goalIds) {
        const series = e1rmSeries(id, window, formula);
        if (series.length === 0) continue;
        score += mean(series.map((point) => point.value));
      }
      if (score > bestScore) {
        bestScore = score;
        strongest = {
          id: `peak-${start}`,
          kind: "peak",
          startDate: start,
          endDate: end,
          title: "Strongest stretch",
          detail: "Four-week window where the goal lifts sat at their highest mean estimated 1RM.",
          magnitude: score,
        };
      }
    }
    if (strongest) events.push(strongest);
  }

  let biggestJump: ChronicleEvent | undefined;
  let jump = 0;
  for (const id of goalIds.length ? goalIds : records.map((row) => row.exerciseId).slice(0, 3)) {
    const series = e1rmSeries(id, slices, formula);
    for (let i = 1; i < series.length; i += 1) {
      const delta = series[i]!.value - series[i - 1]!.value;
      if (delta > jump) {
        jump = delta;
        const name =
          slices.flatMap((slice) => slice.exercises).find((exercise) => exercise.exerciseId === id)
            ?.exerciseNameSnapshot ?? "Lift";
        biggestJump = {
          id: `jump-${id}-${series[i]!.date}`,
          kind: "jump",
          startDate: series[i]!.date,
          title: `Biggest jump · ${name}`,
          detail: "Largest session-to-session estimated 1RM increase on file.",
          exerciseId: id,
          magnitude: delta,
        };
      }
    }
  }
  if (biggestJump) events.push(biggestJump);

  events.sort((a, b) => b.startDate.localeCompare(a.startDate));
  const current = eras[eras.length - 1];
  return { eras, events, current, strongest, biggestJump };
}

function ordinalDate(ordinal: number): string {
  const date = new Date(ordinal * 86_400_000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function eraForDate(eras: TrainingEra[], date: string): TrainingEra | undefined {
  return eras.find((era) => date >= era.startDate && date <= era.endDate);
}
