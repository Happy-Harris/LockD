import { MAX_E1RM_REPS } from "@/domain/oneRepMax";
import { titleCase } from "@/domain/taxonomy";
import { localDateOf, RANGE_DESCRIPTIONS, resolveRange } from "@/domain/time";
import { getClaim } from "@/domain/evidence";
import { exerciseOptions, exerciseProgress, filterByRange, type AnalyticsOptions } from "./compute";
import { muscleBandBalance, muscleBandBalanceSentence } from "./muscleSets";
import { shiftLocalDate, startOfTrainingWeekDate } from "./trainingWeeks";
import { CHANGE_FLAGS_EMPTY, CHANGE_FLAGS_PARTIAL, trainingFlags } from "./trainingFlags";
import { weeklyVerdict, weeklyVerdictCopy } from "./weeklyVerdict";
import {
  detectMuscleInQuery,
  type AskLabAnswer,
  type AskLabContext,
  type AskLabMatch,
  type MuscleContributionRow,
  type StrengthTrendRow,
  type TrainingEnoughMuscleRow,
} from "./askLabShared";

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function claimLinks(...ids: string[]): AskLabMatch[] {
  return ids
    .map((id) => {
      const claim = getClaim(id);
      return claim ? ({ claim, score: 1 } as AskLabMatch) : null;
    })
    .filter((row): row is AskLabMatch => row !== null);
}

function analyticsOptions(context: AskLabContext): AnalyticsOptions {
  return {
    formula: context.formula,
    includeWarmups: context.includeWarmups,
    secondaryCredit: context.secondaryCredit,
  };
}

export function answerTrainingEnough(query: string, context: AskLabContext): AskLabAnswer {
  const reference = context.reference ?? new Date();
  const referenceLocalDate = localDateOf(reference);
  const balance = muscleBandBalance(context.entries, {
    referenceLocalDate,
    weekStart: context.weekStart,
    secondaryCredit: context.secondaryCredit,
    personalTargetBands: context.personalTargetBands,
  });
  const weekStartDate = balance.weekStartDate;
  const weekEndDate = balance.weekEndDate;
  const insights = balance.insights;
  const balanceSentence = muscleBandBalanceSentence(balance);
  const matches = claimLinks(
    "weekly-credited-sets-10-20",
    "secondary-set-credit-default",
    "personal-muscle-targets",
  );

  if (insights.length === 0) {
    return {
      query,
      tier: "partial",
      intent: "training_enough",
      call: `No completed working sets logged in the current training week (${weekStartDate} → ${weekEndDate}).`,
      matches,
      known: `Training week window ${weekStartDate} to ${weekEndDate} with week start ${context.weekStart}.`,
      missing: "Completed working sets in this training week.",
      nextStep:
        "Log a session (or import a backup from another app) so credited sets can be compared to targets.",
      payload: {
        kind: "training_enough",
        weekStartDate,
        weekEndDate,
        muscles: [],
        evidence: [],
        balanceId: balanceSentence.id,
        balancePlain: balanceSentence.plain,
        insufficientMapping: true,
      },
    };
  }

  const muscles: TrainingEnoughMuscleRow[] = insights.map((row) => ({
    muscle: row.muscle,
    sets: row.sets,
    targetMin: row.target?.min,
    targetMax: row.target?.max,
    targetSource: row.targetSource,
    state: row.state,
  }));
  const evidence = insights.flatMap((row) => row.evidence);

  const lead = balanceSentence.plain;
  return {
    query,
    tier: balance.insufficientMapping ? "partial" : "computed",
    intent: "training_enough",
    call: `Current training week ${weekStartDate} → ${weekEndDate}: ${lead}`,
    matches,
    known: balance.insufficientMapping
      ? `Logged sets this week do not map to targetable muscles (or lack targets).`
      : undefined,
    missing: balance.insufficientMapping
      ? "Mapped working sets on targetable muscles, or personal targets where needed."
      : undefined,
    nextStep: balance.insufficientMapping
      ? "Map exercises to muscles in Library, or ask again after logging targetable work."
      : undefined,
    payload: {
      kind: "training_enough",
      weekStartDate,
      weekEndDate,
      muscles,
      evidence,
      balanceId: balanceSentence.id,
      balancePlain: balanceSentence.plain,
      insufficientMapping: balance.insufficientMapping,
    },
  };
}

export function answerMuscleContribution(query: string, context: AskLabContext): AskLabAnswer {
  const muscle = detectMuscleInQuery(query);
  const reference = context.reference ?? new Date();
  const referenceLocalDate = localDateOf(reference);
  const weekStartDate = startOfTrainingWeekDate(referenceLocalDate, context.weekStart);
  const weekEndDate = shiftLocalDate(weekStartDate, 6);
  const matches = claimLinks("secondary-set-credit-default", "weekly-credited-sets-10-20");

  if (!muscle) {
    return {
      query,
      tier: "partial",
      intent: "muscle_contribution",
      call: "Name a muscle to see which exercises contributed credited sets this training week.",
      matches,
      known: `Attribution uses completed working sets in ${weekStartDate} → ${weekEndDate}.`,
      missing: "A muscle group (for example chest, quads, or back).",
      nextStep: "Ask again with a muscle, e.g. “Which exercises contributed to chest?”",
    };
  }

  const balance = muscleBandBalance(context.entries, {
    referenceLocalDate,
    weekStart: context.weekStart,
    secondaryCredit: context.secondaryCredit,
    personalTargetBands: context.personalTargetBands,
  });
  const insights = balance.insights;
  const row = insights.find((insight) => insight.muscle === muscle);
  if (!row || row.evidence.length === 0) {
    return {
      query,
      tier: "partial",
      intent: "muscle_contribution",
      call: `No credited sets for ${titleCase(muscle)} in the current training week (${weekStartDate} → ${weekEndDate}).`,
      matches,
      known: `Week window ${weekStartDate} to ${weekEndDate}.`,
      missing: `Logged working sets that credit ${titleCase(muscle)} this week.`,
      nextStep: `Log a session that trains ${titleCase(muscle)}, then ask again.`,
      payload: {
        kind: "muscle_contribution",
        muscle,
        weekStartDate,
        weekEndDate,
        attributions: [],
        evidence: [],
      },
    };
  }

  const byExercise = new Map<string, MuscleContributionRow>();
  for (const item of row.evidence) {
    const existing = byExercise.get(item.exerciseId) ?? {
      exerciseId: item.exerciseId,
      exerciseName: item.exerciseName,
      creditedSets: 0,
      setCount: 0,
      roles: [],
    };
    existing.creditedSets += item.credit;
    existing.setCount += 1;
    if (!existing.roles.includes(item.role)) existing.roles.push(item.role);
    byExercise.set(item.exerciseId, existing);
  }
  const attributions = [...byExercise.values()].sort(
    (a, b) => b.creditedSets - a.creditedSets || a.exerciseName.localeCompare(b.exerciseName),
  );

  return {
    query,
    tier: "computed",
    intent: "muscle_contribution",
    call: `${titleCase(muscle)} this week: ${attributions.length} exercise${
      attributions.length === 1 ? "" : "s"
    } contributed ${formatSets(row.sets)} credited sets.`,
    matches,
    payload: {
      kind: "muscle_contribution",
      muscle,
      weekStartDate,
      weekEndDate,
      attributions,
      evidence: row.evidence,
    },
  };
}

export function answerVerdictWhy(query: string, context: AskLabContext): AskLabAnswer {
  const reference = context.reference ?? new Date();
  const options = analyticsOptions(context);
  const verdict = weeklyVerdict(
    context.entries,
    options,
    context.weekStart,
    reference,
    context.goalLiftIds,
    context.goalLens,
  );
  const copy = weeklyVerdictCopy(verdict, context.weightUnit ?? "kg");
  const matches = claimLinks("weekly-verdict-deload-shape");
  const lead = copy.lines.map((line) => line.plain).join(" ");

  if (verdict.state === "not_enough_history") {
    return {
      query,
      tier: "partial",
      intent: "verdict_why",
      call: lead || copy.title,
      matches,
      known: `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}; baseline weeks logged: ${verdict.baseline.weeks.length}.`,
      missing: "Enough completed training weeks for a full Weekly Verdict comparison.",
      nextStep: "Keep logging sessions until Weekly Verdict has its baseline, then ask again.",
      payload: {
        kind: "verdict_why",
        weekStart: context.weekStart,
        subjectStartDate: verdict.subject.startDate,
        subjectEndDate: verdict.subject.endDate,
        verdict,
        copy,
      },
    };
  }

  return {
    query,
    tier: "computed",
    intent: "verdict_why",
    call: lead || copy.title,
    matches,
    payload: {
      kind: "verdict_why",
      weekStart: context.weekStart,
      subjectStartDate: verdict.subject.startDate,
      subjectEndDate: verdict.subject.endDate,
      verdict,
      copy,
    },
  };
}

export function answerGettingStronger(query: string, context: AskLabContext): AskLabAnswer {
  const reference = context.reference ?? new Date();
  const options = analyticsOptions(context);
  const range = resolveRange("12w", reference, context.weekStart);
  const windowEntries = filterByRange(context.entries, range);
  const matches = claimLinks("e1rm-formulas", "e1rm-rep-cap-12");
  const windowLabel = RANGE_DESCRIPTIONS["12w"];

  if (windowEntries.length === 0) {
    return {
      query,
      tier: "partial",
      intent: "getting_stronger",
      call: `No completed sets in the ${windowLabel} window to estimate strength trends.`,
      matches,
      known: `Window: ${windowLabel}. e1RM uses sets of ${MAX_E1RM_REPS} reps or fewer.`,
      missing: "Logged working sets with load and reps in this window.",
      nextStep: "Log sessions (or widen history via import), then ask again.",
      payload: {
        kind: "getting_stronger",
        windowKey: "12w",
        windowLabel,
        repCap: MAX_E1RM_REPS,
        trends: [],
      },
    };
  }

  const exercises = exerciseOptions(windowEntries).slice(0, 8);
  const trends: StrengthTrendRow[] = [];
  for (const exercise of exercises) {
    const progress = exerciseProgress(windowEntries, exercise.id, options);
    if (progress.oneRepMax.length < 2) continue;
    const first = progress.oneRepMax[0]!;
    const last = progress.oneRepMax[progress.oneRepMax.length - 1]!;
    const lastBest = progress.bestWeight[progress.bestWeight.length - 1];
    trends.push({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sessionsWithE1rm: progress.oneRepMax.length,
      firstE1rmG: first.value,
      lastE1rmG: last.value,
      changePercent: first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null,
      lastBestWeightG: lastBest?.value ?? null,
      first: first.source,
      last: last.source,
    });
  }

  if (trends.length === 0) {
    return {
      query,
      tier: "partial",
      intent: "getting_stronger",
      call: `Not enough e1RM samples in the ${windowLabel} window (need at least two sessions per lift; sets above ${MAX_E1RM_REPS} reps are excluded).`,
      matches,
      known: `${exercises.length} exercise${exercises.length === 1 ? "" : "s"} appeared in the window.`,
      missing: "Two or more sessions with load×reps ≤ 12 for at least one lift.",
      nextStep: "Log another session on a tracked lift, then ask again.",
      payload: {
        kind: "getting_stronger",
        windowKey: "12w",
        windowLabel,
        repCap: MAX_E1RM_REPS,
        trends: [],
      },
    };
  }

  const rising = trends.filter((row) => row.changePercent != null && row.changePercent > 0).length;
  const unknown = trends.filter((row) => row.changePercent == null).length;
  const flatOrDown = trends.length - rising - unknown;
  return {
    query,
    tier: "computed",
    intent: "getting_stronger",
    call: `Over ${windowLabel}, ${rising} of ${trends.length} tracked lift${
      trends.length === 1 ? "" : "s"
    } show a higher latest e1RM vs first sample${
      flatOrDown > 0 ? `; ${flatOrDown} flat or down` : ""
    }${unknown > 0 ? `; ${unknown} with no change that can be worked out` : ""}. Sets above ${MAX_E1RM_REPS} reps stay out of e1RM.`,
    matches,
    payload: {
      kind: "getting_stronger",
      windowKey: "12w",
      windowLabel,
      repCap: MAX_E1RM_REPS,
      trends,
    },
  };
}

export function answerChangeFlags(query: string, context: AskLabContext): AskLabAnswer {
  const reference = context.reference ?? new Date();
  const options = analyticsOptions(context);
  const flags = trainingFlags(
    context.entries,
    options,
    context.weekStart,
    reference,
    context.goalLiftIds,
    context.goalLens,
  );
  const activeLabels = flags.active.map((flag) => flag.label);
  const receipts = flags.active.map((flag) => flag.receipt);
  const partialStalls = flags.stalls.filter((flag) => flag.status === "partial");
  const hasPartialStalls = partialStalls.length > 0;
  const partialFlags = [flags.deload, flags.spike, ...partialStalls].filter(
    (flag) => flag.status === "partial",
  );
  const claimIds = [...new Set([...flags.active, ...partialFlags].map((flag) => flag.claimId))];
  const matches = claimLinks(...claimIds);

  if (flags.active.length === 0 && flags.hasPartial) {
    return {
      query,
      tier: "partial",
      intent: "change_flags",
      call: CHANGE_FLAGS_PARTIAL,
      matches,
      known: partialFlags.map((flag) => flag.receipt).join(" "),
      missing: "Enough comparable weekly and goal-lift history for every flag check.",
      nextStep: "Keep logging completed sessions, then ask again after another comparable week.",
      payload: {
        kind: "change_flags",
        subjectStartDate: flags.deload.subjectStartDate,
        subjectEndDate: flags.deload.subjectEndDate,
        activeLabels: [],
        receipts: [],
        hasPartialStalls,
        hasPartialChecks: true,
      },
    };
  }

  if (flags.active.length === 0) {
    return {
      query,
      tier: "computed",
      intent: "change_flags",
      call: CHANGE_FLAGS_EMPTY,
      matches,
      payload: {
        kind: "change_flags",
        subjectStartDate: flags.deload.subjectStartDate,
        subjectEndDate: flags.deload.subjectEndDate,
        activeLabels: [],
        receipts: [],
        hasPartialStalls: false,
        hasPartialChecks: false,
      },
    };
  }

  return {
    query,
    tier: flags.hasPartial ? "partial" : "computed",
    intent: "change_flags",
    call: `Active flags: ${activeLabels.join("; ")}.`,
    matches,
    known: receipts.join(" "),
    nextStep: hasPartialStalls
      ? "Open Data Lab → What should I change? for receipts. Some goal lifts still need more sessions for a stall claim."
      : "Open Data Lab → What should I change? to inspect each flag receipt.",
    payload: {
      kind: "change_flags",
      subjectStartDate: flags.deload.subjectStartDate,
      subjectEndDate: flags.deload.subjectEndDate,
      activeLabels,
      receipts,
      hasPartialStalls,
      hasPartialChecks: flags.hasPartial,
    },
  };
}
