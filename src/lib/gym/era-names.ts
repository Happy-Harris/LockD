import type { SessionSlice } from "./analytics";

/**
 * How the Chronicle words an era's automatic name (owner, 2026-09-30). A name is a navigation aid read off the log:
 * the training split the sessions were named for, else what the numbers show (a return after a layoff, a volume or
 * strength block), placed in time by the calendar. Nothing narrative is made up, and repeats are told apart by date,
 * never by "· 2". A name the lifter typed always wins; this only words the automatic one.
 *
 * Product heuristics, not research (catalog claim `era-naming-rules`).
 */

/** An era needs at least this many sessions before a split is read from its workout names. */
export const ERA_PATTERN_MIN_SESSIONS = 6;
/** …and at least this share of them named for one split's days. */
export const ERA_PATTERN_SHARE = 0.75;

const SPLITS: Array<{ label: string; days: string[][] }> = [
  { label: "Push/Pull/Legs", days: [["push"], ["pull"], ["legs", "leg"]] },
  { label: "Upper/Lower", days: [["upper"], ["lower"]] },
  { label: "Full Body", days: [["fullbody", "full body"]] },
];

function words(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Which of a split's days a session name is, or -1. A name that fits two days (e.g. "Push Pull") fits none. */
function dayOf(name: string, days: string[][]): number {
  const text = words(name);
  const hits = days
    .map((aliases, index) => (aliases.some((alias) => text.includes(` ${alias} `)) ? index : -1))
    .filter((index) => index >= 0);
  return hits.length === 1 ? hits[0]! : -1;
}

/**
 * The split an era's sessions were named for, when the log clearly shows one: at least ERA_PATTERN_MIN_SESSIONS
 * sessions, ERA_PATTERN_SHARE of them named for that split's days, and every day of it present.
 */
export function trainingPattern(slices: readonly SessionSlice[]): string | undefined {
  if (slices.length < ERA_PATTERN_MIN_SESSIONS) return undefined;
  let best: { label: string; share: number } | undefined;
  for (const split of SPLITS) {
    const days = slices.map((slice) => dayOf(slice.workout.name ?? "", split.days));
    const matched = days.filter((day) => day >= 0);
    const share = matched.length / slices.length;
    const allDays = split.days.every((_, index) => matched.includes(index));
    if (share >= ERA_PATTERN_SHARE && allDays && (!best || share > best.share)) {
      best = { label: split.label, share };
    }
  }
  return best?.label;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function seasonOf(month: number): string {
  if (month <= 2 || month === 12) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Autumn";
}

/**
 * Ways to place a date in time, coarsest first. `prefix` qualifies a name ("2021 Return"); `alone` is an ordinary
 * era's whole name ("Spring 2024").
 */
function calendar(date: string, style: "prefix" | "alone"): string[] {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const monthName = MONTHS[month - 1]!;
  const exact = `${day} ${monthName} ${year}`;
  if (style === "alone") return [`${seasonOf(month)} ${year}`, `${monthName} ${year}`, exact];
  return [year, `${month <= 6 ? "Early" : "Late"} ${year}`, `${monthName} ${year}`, exact];
}

export interface EraNameInput {
  startDate: string;
  /** What the era is: "Foundation", "Return", "Push/Pull/Legs Run", "Strength Block"… Empty for an ordinary era. */
  base: string;
  /** Always place it in time (returns and blocks), or only when another era would share the name. */
  dated: boolean;
}

/**
 * The automatic names, in order. Each era gets the coarsest date that tells it apart from the others with the same
 * base, so one 2021 return is "2021 Return" while two in 2024 are "Early 2024 Return" and "Late 2024 Return".
 */
export function wordEraNames(eras: readonly EraNameInput[]): string[] {
  return eras.map((era, index) => {
    const peers = eras.filter((other, j) => j !== index && other.base === era.base);
    if (era.base && !era.dated && peers.length === 0) return era.base;
    const style = era.base ? "prefix" : "alone";
    const mine = calendar(era.startDate, style);
    const level = mine.findIndex((label, depth) =>
      peers.every((peer) => calendar(peer.startDate, style)[depth] !== label),
    );
    const when = mine[level === -1 ? mine.length - 1 : level]!;
    return era.base ? `${when} ${era.base}` : when;
  });
}
