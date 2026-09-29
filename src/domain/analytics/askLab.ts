import { EVIDENCE_CLAIMS, getClaim } from "@/domain/evidence";
import {
  EXPLORE_BADGE,
  normalize,
  type AskLabAnswer,
  type AskLabContext,
  type AskLabDataIntent,
  type AskLabMatch,
} from "./askLabShared";
import {
  answerChangeFlags,
  answerGettingStronger,
  answerMuscleContribution,
  answerTrainingEnough,
  answerVerdictWhy,
} from "./askLabData";

export type {
  AskLabAnswer,
  AskLabContext,
  AskLabDataIntent,
  AskLabMatch,
  AskLabPayload,
  AskLabTier,
  MuscleContributionRow,
  StrengthTrendRow,
  TrainingEnoughMuscleRow,
} from "./askLabShared";
export { ASK_LAB_STARTERS, EXPLORE_BADGE, detectMuscleInQuery } from "./askLabShared";

type CatalogRule = {
  claimId: string;
  needles: readonly string[];
};

type IntentRule = {
  intent: AskLabDataIntent;
  needles: readonly string[];
};

const CATALOG_RULES: readonly CatalogRule[] = [
  {
    claimId: "weekly-credited-sets-10-20",
    needles: [
      "10-20",
      "10–20",
      "10 to 20",
      "weekly sets",
      "credited sets",
      "set band",
      "hypertrophy volume",
      "research default",
      "muscle target",
      "why this range",
    ],
  },
  {
    claimId: "secondary-set-credit-default",
    needles: [
      "secondary",
      "0.5",
      "half credit",
      "fractional",
      "indirect set",
      "secondary credit",
      "secondary muscle",
    ],
  },
  {
    claimId: "personal-muscle-targets",
    needles: [
      "personal target",
      "my target",
      "my targets",
      "override",
      "custom target",
      "personal muscle",
    ],
  },
  {
    claimId: "e1rm-formulas",
    needles: ["e1rm", "estimated 1rm", "one rep max", "1rm", "epley", "brzycki"],
  },
  {
    claimId: "e1rm-rep-cap-12",
    needles: ["12 rep", "rep cap", "above 12", "high rep", "reps cap"],
  },
  {
    claimId: "tonnage-weight-times-reps",
    needles: ["tonnage", "volume is", "weight × reps", "weight x reps", "how is volume"],
  },
  {
    claimId: "weekly-verdict-deload-shape",
    needles: ["deload", "de-load", "lighter week", "recovery week"],
  },
  {
    claimId: "proximity-to-failure-context",
    needles: ["failure", "rir", "proximity to failure", "near failure", "to failure"],
  },
];

/** Personal / data intents — checked before catalog research Qs. */
const INTENT_RULES: readonly IntentRule[] = [
  {
    intent: "training_enough",
    needles: [
      "am i training enough",
      "am i doing enough",
      "training enough",
      "enough this week",
      "my credited sets",
      "enough volume this week",
      "hard sets this week",
    ],
  },
  {
    intent: "muscle_contribution",
    needles: [
      "which exercises contributed",
      "what exercises contributed",
      "contributed to",
      "contribution to",
      "which lifts hit",
      "what hit my",
      "exercise attribution",
      "which exercises hit",
    ],
  },
  {
    intent: "verdict_why",
    needles: [
      "why did weekly verdict",
      "why did my weekly verdict",
      "why did the weekly verdict",
      "weekly verdict change",
      "verdict change",
      "why did my verdict",
      "why is weekly verdict",
      "explain weekly verdict",
      "weekly verdict why",
    ],
  },
  {
    intent: "getting_stronger",
    needles: [
      "am i getting stronger",
      "getting stronger",
      "am i stronger",
      "strength trend",
      "e1rm trend",
      "best set trend",
      "progress on lifts",
    ],
  },
  {
    intent: "change_flags",
    needles: [
      "what should i change",
      "should i change",
      "stall flag",
      "spike flag",
      "deload flag",
      "stall spike deload",
      "am i stalled",
      "volume spike",
      "training flags",
    ],
  },
];

function detectIntent(normalized: string): AskLabDataIntent | null {
  let best: { intent: AskLabDataIntent; score: number } | null = null;
  for (const rule of INTENT_RULES) {
    let score = 0;
    for (const needle of rule.needles) {
      if (normalized.includes(needle)) score += needle.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { intent: rule.intent, score };
  }
  return best?.intent ?? null;
}

function catalogMatches(normalized: string): AskLabMatch[] {
  const scores = new Map<string, number>();
  for (const rule of CATALOG_RULES) {
    let score = 0;
    for (const needle of rule.needles) {
      if (normalized.includes(needle)) score += 1;
    }
    if (score > 0) scores.set(rule.claimId, (scores.get(rule.claimId) ?? 0) + score);
  }

  for (const claim of EVIDENCE_CLAIMS) {
    const hay = normalize(`${claim.statement} ${claim.behaviors.join(" ")} ${claim.id}`);
    let bonus = 0;
    for (const token of normalized.split(" ")) {
      if (token.length < 4) continue;
      if (hay.includes(token)) bonus += 0.25;
    }
    if (bonus >= 0.75) scores.set(claim.id, (scores.get(claim.id) ?? 0) + bonus);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([claimId, score]) => {
      const claim = getClaim(claimId);
      if (!claim) return null;
      return { claim, score };
    })
    .filter((row): row is AskLabMatch => row !== null);
}

function answerDataIntent(
  query: string,
  intent: AskLabDataIntent,
  context: AskLabContext | undefined,
): AskLabAnswer {
  if (!context) {
    return {
      query,
      tier: "partial",
      intent,
      call: "Open Ask the Lab from Data Lab so answers can use your logged training.",
      matches: [],
      known: `Intent recognized: ${intent}.`,
      missing: "App-computed training data from Data Lab.",
      nextStep: "Open Data Lab → Ask the Lab, then ask again.",
    };
  }

  switch (intent) {
    case "training_enough":
      return answerTrainingEnough(query, context);
    case "muscle_contribution":
      return answerMuscleContribution(query, context);
    case "verdict_why":
      return answerVerdictWhy(query, context);
    case "getting_stronger":
      return answerGettingStronger(query, context);
    case "change_flags":
      return answerChangeFlags(query, context);
  }
}

function answerCatalog(query: string, normalized: string): AskLabAnswer | null {
  const matches = catalogMatches(normalized);
  if (matches.length === 0) return null;
  return {
    query,
    tier: "computed",
    intent: null,
    call: matches[0]!.claim.statement,
    matches,
  };
}

function answerExplore(query: string): AskLabAnswer {
  return {
    query,
    tier: "explore",
    intent: null,
    call: EXPLORE_BADGE,
    matches: [],
    known: "Ask the Lab answers from your logged training or the shared evidence catalog.",
    missing:
      "A data question (training enough, muscle contribution, verdict, strength, change flags) or a catalog claim.",
    nextStep:
      "Try a starter chip, or ask about a Lock’d default (10–20 sets, 0.5 secondary, e1RM).",
  };
}

/**
 * Data-grounded Ask the Lab.
 * Prefer app-computed intents; fall back to the evidence catalog; never invent metrics.
 */
export function answerAskLab(query: string, context?: AskLabContext): AskLabAnswer {
  const normalized = normalize(query);
  if (!normalized) {
    return {
      query,
      tier: "partial",
      intent: null,
      call: "Ask about your logged training, or a Lock’d default / formula.",
      matches: [],
      missing: "A question.",
      nextStep: "Pick a starter chip or type a training question.",
    };
  }

  const intent = detectIntent(normalized);
  if (intent) return answerDataIntent(query, intent, context);

  const catalog = answerCatalog(query, normalized);
  if (catalog) return catalog;

  return answerExplore(query);
}
