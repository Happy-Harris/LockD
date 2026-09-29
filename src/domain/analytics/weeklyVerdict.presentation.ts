import type { VerdictLens } from "./lens";
import type { WeightUnit } from "@/domain/units";
import { muscleBandBalanceSentence, type MuscleBandBalance } from "./muscleSets";
import { metricsFor } from "./weeklyVerdict.metrics";
import { formatMetric, formatWeight, plural } from "./weeklyVerdict.util";
import {
  MIN_BASELINE_WEEKS,
  type MetricEvidence,
  type SentencePart,
  type VerdictEvidenceKey,
  type VerdictSentence,
  type WeeklyDirection,
  type WeeklyPulse,
  type WeeklyVerdict,
  type WeeklyVerdictCopy,
  type WeeklyVerdictRule,
} from "./weeklyVerdict";

export function weeklyVerdictCopy(
  verdict: WeeklyVerdict,
  weightUnit: WeightUnit,
  muscleBalance?: MuscleBandBalance | null,
  lens: VerdictLens = "build",
): WeeklyVerdictCopy {
  const balanceSlot = balanceCopy(muscleBalance);
  const baselineCount = verdict.baseline.weeks.length;
  const baselineLabel =
    baselineCount === 4
      ? "4-week baseline"
      : `Based on ${baselineCount} week${baselineCount === 1 ? "" : "s"}`;

  if (verdict.state === "not_enough_history") {
    const remaining = Math.max(0, MIN_BASELINE_WEEKS - baselineCount);
    const weekWord = remaining === 1 ? "week" : "weeks";
    return {
      available: false,
      title: "Building your baseline",
      baselineLabel,
      lines: [
        sentence([
          { type: "text", text: "Needs " },
          {
            type: "metric",
            text: `${remaining} more training ${weekWord}`,
            evidenceKey: "baseline_weeks",
          },
          {
            type: "text",
            text: " before comparing your training honestly.",
          },
        ]),
      ],
      ...balanceSlot,
      pulse: pulseSentence(verdict.pulse),
    };
  }

  if (verdict.state === "welcome_back") {
    const sessions = verdict.subject.metrics.sessions;
    return {
      available: true,
      title: "Last week",
      baselineLabel,
      lines: [
        sentence([
          { type: "text", text: "Welcome back — you logged " },
          {
            type: "metric",
            text: `${sessions} ${plural(sessions, "session")}`,
            evidenceKey: "sessions",
          },
          {
            type: "text",
            text: " last week after at least two weeks away.",
          },
        ]),
        sentence([
          {
            type: "text",
            text: "No comparison this week; your older training stays intact as context.",
          },
        ]),
        sentence([
          {
            type: "text",
            text: "Build another week and the normal verdict resumes.",
          },
        ]),
      ],
      ...balanceSlot,
      pulse: pulseSentence(verdict.pulse),
    };
  }

  if (verdict.state === "deload") {
    return {
      available: true,
      title: "Last week",
      baselineLabel,
      lines: deloadLines(lens, verdict.intensityHeld === true),
      ...balanceSlot,
      pulse: pulseSentence(verdict.pulse),
    };
  }

  return {
    available: true,
    title: "Last week",
    baselineLabel,
    lines: [
      directionSentence(
        verdict.direction!,
        verdict.subject.metrics.hardSets,
        baselineCount,
        lens,
        verdict.standout!,
        verdict.watchout!,
      ),
      standoutSentence(verdict.standout!, weightUnit),
      watchoutSentence(verdict.watchout!),
    ],
    ...balanceSlot,
    pulse: pulseSentence(verdict.pulse),
  };
}

/** Deload-state lines. Build is unchanged; Strength names both facts when e1RM held; Maintain drops the jargon. */
function deloadLines(lens: VerdictLens, intensityHeld: boolean): VerdictSentence[] {
  if (lens === "strength" && intensityHeld) {
    return [
      sentence([
        {
          type: "text",
          text: "Lighter week, but your goal lift held its numbers — an intensity block, not a deload.",
        },
      ]),
      sentence([
        {
          type: "text",
          text: "No single lift or metric stood out this week.",
        },
      ]),
      sentence([
        {
          type: "text",
          text: "Nothing to fix — return to normal training when planned.",
        },
      ]),
    ];
  }

  if (lens === "maintain") {
    return [
      sentence([
        {
          type: "text",
          text: "Lighter week, consistent sessions.",
        },
      ]),
      sentence([
        {
          type: "text",
          text: "No single lift or metric stood out this week.",
        },
      ]),
      sentence([
        {
          type: "text",
          text: "Nothing to fix — return to normal training when planned.",
        },
      ]),
    ];
  }

  return [
    sentence([
      {
        type: "text",
        text: "Lighter week, consistent sessions — looks like a deload.",
      },
    ]),
    sentence([
      {
        type: "text",
        text: "No single lift or metric stood out this week.",
      },
    ]),
    sentence([
      {
        type: "text",
        text: "Nothing to fix — return to normal training when planned.",
      },
    ]),
  ];
}

export function metricEvidenceFor(
  verdict: WeeklyVerdict,
  key: VerdictEvidenceKey,
  weightUnit: WeightUnit,
  muscleBalance?: MuscleBandBalance | null,
): MetricEvidence {
  const weekMetrics = verdict.baseline.weeks.map((week) => ({
    startDate: week.startDate,
    endDate: week.endDate,
    metrics: metricsFor(week.entries),
  }));

  switch (key) {
    case "hard_sets":
      return {
        key,
        label: "Hard sets",
        formula:
          "Completed working sets only. Warm-up, drop and failure sets do not count toward direction.",
        subjectLabel: "Last completed week",
        subjectValue: `${formatMetric(verdict.subject.metrics.hardSets)} hard sets`,
        baselineMean: `${formatMetric(verdict.baseline.metrics.hardSets)} hard sets`,
        baselineWeeks: weekMetrics.map((week) => ({
          startDate: week.startDate,
          endDate: week.endDate,
          value: `${formatMetric(week.metrics.hardSets)} hard sets`,
        })),
      };
    case "sessions":
      return {
        key,
        label: "Sessions",
        formula: "Distinct completed workouts in the week, keyed by workout id.",
        subjectLabel: "Last completed week",
        subjectValue: `${formatMetric(verdict.subject.metrics.sessions)} sessions`,
        baselineMean: `${formatMetric(verdict.baseline.metrics.sessions)} sessions`,
        baselineWeeks: weekMetrics.map((week) => ({
          startDate: week.startDate,
          endDate: week.endDate,
          value: `${formatMetric(week.metrics.sessions)} sessions`,
        })),
      };
    case "tonnage":
      return {
        key,
        label: "Tonnage",
        formula:
          "Sum of weight × reps for completed non-warm-up weight_reps sets. Used for standouts, never direction.",
        subjectLabel: "Last completed week",
        subjectValue: `${formatWeight(verdict.subject.metrics.tonnageG, weightUnit)} ${weightUnit}`,
        baselineMean: `${formatWeight(verdict.baseline.metrics.tonnageG, weightUnit)} ${weightUnit}`,
        baselineWeeks: weekMetrics.map((week) => ({
          startDate: week.startDate,
          endDate: week.endDate,
          value: `${formatWeight(week.metrics.tonnageG, weightUnit)} ${weightUnit}`,
        })),
      };
    case "direction_change": {
      const change = verdict.direction?.changePercent;
      return {
        key,
        label: "Hard-set change",
        formula:
          "((last week hard sets − baseline mean hard sets) ÷ baseline mean) × 100. Direction bands: >50 big jump, ≥10 up, >−10 steady, ≥−30 down, else well down.",
        subjectLabel: "Last completed week",
        subjectValue:
          change === null || change === undefined
            ? "No baseline hard sets"
            : `${Math.round(change)}% vs baseline`,
        baselineMean: `${formatMetric(verdict.baseline.metrics.hardSets)} hard sets`,
        baselineWeeks: weekMetrics.map((week) => ({
          startDate: week.startDate,
          endDate: week.endDate,
          value: `${formatMetric(week.metrics.hardSets)} hard sets`,
        })),
      };
    }
    case "pulse_hard_sets": {
      const pulse = verdict.pulse;
      return {
        key,
        label: "Same-span hard sets",
        formula:
          "Current-week hard sets through today’s elapsed local day, compared with the identical day-count slice of each selected baseline week. Never compared with full weeks. Hidden on day 1.",
        subjectLabel: "This week so far",
        subjectValue: pulse
          ? `${formatMetric(pulse.currentHardSets)} hard sets`
          : "Hidden on day 1",
        baselineMean: pulse ? `${formatMetric(pulse.baselineHardSetsAverage)} hard sets` : "—",
        baselineWeeks: weekMetrics.map((week) => ({
          startDate: week.startDate,
          endDate: week.endDate,
          value: "Same elapsed-day slice (see formula)",
        })),
      };
    }
    case "e1rm":
      return {
        key,
        label: "Estimated 1RM",
        formula:
          "Best capped e1RM (≤12 reps) from completed non-warm-up sets under the active formula. Standout/watch-out only.",
        subjectLabel: "Last completed week",
        subjectValue: verdict.standout?.text?.split("|")[1]
          ? `${formatWeight(Number(verdict.standout.text.split("|")[1]), weightUnit)} ${weightUnit}`
          : "See standout sentence",
        baselineMean: "Prior best / baseline-window best per rule",
        baselineWeeks: weekMetrics.map((week) => ({
          startDate: week.startDate,
          endDate: week.endDate,
          value: "Lift-specific (not week totals)",
        })),
      };
    case "baseline_weeks":
      return {
        key,
        label: "Baseline weeks",
        formula:
          "Mean of up to 4 most recent non-empty training weeks inside the 8 completed weeks before the subject week. 3 weeks unlocks the verdict and is labelled.",
        subjectLabel: "Selected baseline",
        subjectValue: `${verdict.baseline.weeks.length} training week${verdict.baseline.weeks.length === 1 ? "" : "s"}`,
        baselineMean: `${formatMetric(verdict.baseline.metrics.hardSets)} hard sets mean`,
        baselineWeeks: weekMetrics.map((week) => ({
          startDate: week.startDate,
          endDate: week.endDate,
          value: `${formatMetric(week.metrics.hardSets)} hard sets · ${formatMetric(week.metrics.sessions)} sessions`,
        })),
      };
    case "muscle_balance": {
      const balance = muscleBalance;
      const judged = balance?.judged ?? [];
      const detail =
        judged.length === 0
          ? "No targetable mapped volume in the subject week."
          : judged
              .map((row) => {
                const band =
                  row.target !== undefined
                    ? `${formatMetric(row.target.min)}–${formatMetric(row.target.max)}`
                    : "no band";
                const source = row.targetSource ?? "n/a";
                return `${row.muscle}: ${formatMetric(row.sets)} credited sets vs ${band} (${source})`;
              })
              .join("; ");
      return {
        key,
        label: "Muscle balance",
        formula:
          "Credited working sets in the subject training week per muscle, compared with the personal target band when set, otherwise the research default 10–20. Secondary muscles use fractional credit. The 10–20 upper bound is a product default, not a hard science ceiling — see catalog claim weekly-credited-sets-10-20 for limits.",
        subjectLabel: "Last completed week",
        subjectValue: balance ? muscleBandBalanceSentence(balance).plain : "No balance data",
        baselineMean: "Per-muscle bands (not a week-mean metric)",
        baselineWeeks: balance
          ? [
              {
                startDate: balance.weekStartDate,
                endDate: balance.weekEndDate,
                value: detail,
              },
            ]
          : [],
      };
    }
  }
}

function balanceCopy(
  muscleBalance: MuscleBandBalance | null | undefined,
): Pick<WeeklyVerdictCopy, "balance" | "balanceId"> {
  if (!muscleBalance) return {};
  const built = muscleBandBalanceSentence(muscleBalance);
  return {
    balanceId: built.id,
    balance: sentence([
      {
        type: "metric",
        text: built.plain,
        evidenceKey: "muscle_balance",
      },
    ]),
  };
}

function sentence(parts: SentencePart[]): VerdictSentence {
  return { plain: parts.map((part) => part.text).join(""), parts };
}

/**
 * For the Strength lens, names whether the goal lift's e1RM is concurrently up or down, reusing
 * the already-built standout/watchout rules — no new metric, no new evidence key.
 */
function strengthE1rmClause(standout: WeeklyVerdictRule, watchout: WeeklyVerdictRule): string {
  if (standout.id === "standout_new_e1rm_best" || standout.id === "standout_e1rm_up") {
    return " Your e1RM is still climbing.";
  }
  if (watchout.id === "watchout_e1rm_slip") {
    return " Your e1RM has slipped too.";
  }
  return "";
}

function directionSentence(
  direction: WeeklyDirection,
  hardSets: number,
  baselineWeeks: number,
  lens: VerdictLens,
  standout: WeeklyVerdictRule,
  watchout: WeeklyVerdictRule,
): VerdictSentence {
  if (direction.changePercent === null) {
    return sentence([
      {
        type: "metric",
        text: `${hardSets} hard ${plural(hardSets, "set")}`,
        evidenceKey: "hard_sets",
      },
      {
        type: "text",
        text: " last week; your recent baseline has no working sets to compare yet.",
      },
    ]);
  }

  const change = Math.abs(Math.round(direction.changePercent));
  const averageLabel = `${baselineWeeks}-week average`;
  const hard = {
    type: "metric" as const,
    text: `${hardSets} hard sets`,
    evidenceKey: "hard_sets" as const,
  };
  const pct = {
    type: "metric" as const,
    text: `${change}%`,
    evidenceKey: "direction_change" as const,
  };

  switch (direction.band) {
    case "big_jump":
      return sentence([
        hard,
        { type: "text", text: ", " },
        pct,
        { type: "text", text: ` above your ${averageLabel} — a big jump.` },
      ]);
    case "up":
      return sentence([
        hard,
        { type: "text", text: ", " },
        pct,
        { type: "text", text: ` above your ${averageLabel}.` },
      ]);
    case "steady":
      return sentence([hard, { type: "text", text: `, in line with your ${averageLabel}.` }]);
    case "down":
      if (lens === "maintain") {
        return sentence([
          hard,
          { type: "text", text: ", " },
          pct,
          { type: "text", text: ` below your ${averageLabel} — holding within your usual range.` },
        ]);
      }
      return sentence([
        hard,
        { type: "text", text: ", " },
        pct,
        {
          type: "text",
          text: ` below your ${averageLabel}.${lens === "strength" ? strengthE1rmClause(standout, watchout) : ""}`,
        },
      ]);
    case "well_down":
      return sentence([
        hard,
        { type: "text", text: ", " },
        pct,
        {
          type: "text",
          text: ` below your ${averageLabel}.${lens === "strength" ? strengthE1rmClause(standout, watchout) : ""}`,
        },
      ]);
  }
}

function standoutSentence(rule: WeeklyVerdictRule, unit: WeightUnit): VerdictSentence {
  if (rule.id === "standout_new_e1rm_best" && rule.text) {
    const [name, grams] = rule.text.split("|");
    return sentence([
      { type: "text", text: `${name} hit a new best estimate of ` },
      {
        type: "metric",
        text: `${formatWeight(Number(grams), unit)} ${unit}`,
        evidenceKey: "e1rm",
      },
      { type: "text", text: "." },
    ]);
  }
  if (rule.id === "standout_e1rm_up" && rule.text) {
    const [name, change] = rule.text.split("|");
    return sentence([
      { type: "text", text: `${name} is up ` },
      {
        type: "metric",
        text: `${change}%`,
        evidenceKey: "e1rm",
      },
      { type: "text", text: " on your recent best." },
    ]);
  }
  if (rule.id === "standout_metric_mover" && rule.text) {
    const [name, changeRaw] = rule.text.split("|");
    const change = Number(changeRaw);
    const signed = change > 0 ? `+${change}` : String(change);
    const evidenceKey: VerdictEvidenceKey =
      name === "Sessions" ? "sessions" : name === "Tonnage" ? "tonnage" : "hard_sets";
    return sentence([
      { type: "text", text: `${name} was your biggest mover at ` },
      {
        type: "metric",
        text: `${signed}%`,
        evidenceKey,
      },
      { type: "text", text: "." },
    ]);
  }
  return sentence([{ type: "text", text: "No single lift or metric stood out." }]);
}

function watchoutSentence(rule: WeeklyVerdictRule): VerdictSentence {
  if (rule.id === "watchout_big_jump") {
    return sentence([
      {
        type: "text",
        text: "That's a sharp rise — keep an eye on recovery next week.",
      },
    ]);
  }
  if (rule.id === "watchout_e1rm_slip" && rule.text) {
    return sentence([
      {
        type: "metric",
        text: rule.text,
        evidenceKey: "e1rm",
      },
      {
        type: "text",
        text: " has slipped 2 weeks running; check sleep, load or technique.",
      },
    ]);
  }
  if (rule.id === "watchout_sessions_down" && rule.text) {
    const [sessions, baseline] = rule.text.split("|");
    return sentence([
      { type: "text", text: "You trained " },
      {
        type: "metric",
        text: `${sessions} times`,
        evidenceKey: "sessions",
      },
      { type: "text", text: " vs your usual " },
      {
        type: "metric",
        text: String(baseline),
        evidenceKey: "sessions",
      },
      { type: "text", text: "; consistency is the easy win." },
    ]);
  }
  return sentence([{ type: "text", text: "Nothing to fix — repeat it." }]);
}

function pulseSentence(pulse: WeeklyPulse | null): VerdictSentence | undefined {
  if (!pulse) return undefined;
  if (pulse.changePercent === null || Math.abs(pulse.changePercent) < 10) {
    return sentence([
      { type: "text", text: "This week so far: " },
      {
        type: "metric",
        text: `${pulse.currentHardSets} hard ${plural(pulse.currentHardSets, "set")}`,
        evidenceKey: "pulse_hard_sets",
      },
      {
        type: "text",
        text: ", in line with your usual pace by this point.",
      },
    ]);
  }
  const change = Math.abs(Math.round(pulse.changePercent));
  return sentence([
    { type: "text", text: "This week so far: " },
    {
      type: "metric",
      text: `${pulse.currentHardSets} hard ${plural(pulse.currentHardSets, "set")}`,
      evidenceKey: "pulse_hard_sets",
    },
    { type: "text", text: ", " },
    {
      type: "metric",
      text: `${change}%`,
      evidenceKey: "pulse_hard_sets",
    },
    {
      type: "text",
      text: ` ${pulse.changePercent > 0 ? "above" : "below"} your usual pace by this point.`,
    },
  ]);
}
