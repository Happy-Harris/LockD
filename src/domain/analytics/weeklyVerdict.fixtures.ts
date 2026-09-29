import type { VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
export type { FixtureGroup, VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
export { GOLDEN_OPTIONS, fixtureEntry } from "./weeklyVerdict.fixtures.helpers";
export { ELIGIBILITY_FIXTURES } from "./weeklyVerdict.fixtures.eligibility";
export { WINDOW_FIXTURES } from "./weeklyVerdict.fixtures.windows";
export { PULSE_FIXTURES } from "./weeklyVerdict.fixtures.pulse";
export { DIRECTION_FIXTURES } from "./weeklyVerdict.fixtures.direction";
export { SPECIAL_STATE_FIXTURES } from "./weeklyVerdict.fixtures.special";
export { STANDOUT_WATCHOUT_FIXTURES } from "./weeklyVerdict.fixtures.standout";
export { DATA_CHANGE_FIXTURES } from "./weeklyVerdict.fixtures.data";

import { ELIGIBILITY_FIXTURES } from "./weeklyVerdict.fixtures.eligibility";
import { WINDOW_FIXTURES } from "./weeklyVerdict.fixtures.windows";
import { PULSE_FIXTURES } from "./weeklyVerdict.fixtures.pulse";
import { DIRECTION_FIXTURES } from "./weeklyVerdict.fixtures.direction";
import { SPECIAL_STATE_FIXTURES } from "./weeklyVerdict.fixtures.special";
import { STANDOUT_WATCHOUT_FIXTURES } from "./weeklyVerdict.fixtures.standout";
import { DATA_CHANGE_FIXTURES } from "./weeklyVerdict.fixtures.data";

export const SHIPPED_GOLDEN_FIXTURES: VerdictFixture[] = [
  ...ELIGIBILITY_FIXTURES,
  ...WINDOW_FIXTURES,
  ...PULSE_FIXTURES,
  ...DIRECTION_FIXTURES,
  ...SPECIAL_STATE_FIXTURES,
  ...STANDOUT_WATCHOUT_FIXTURES,
  ...DATA_CHANGE_FIXTURES,
];

/** Remaining plan targets (60 total) not yet shipped — list in PR. */
export const DEFERRED_GOLDEN_FIXTURE_NAMES = [
  "windows: Mon/Sun/Sat empty-week mid-lookback edge (extra)",
  "windows: DST travel with localDate unchanged (extra travel offsets)",
  "windows: imported session fingerprint membership",
  "pulse: day 3 / day 6 / day 7 elapsed slices",
  "pulse: Saturday/Sunday mid-week above-pace",
  "pulse: below-pace same-span",
  "direction: zero hard-set baseline steady copy",
  "direction: Saturday/Sunday week direction bands",
  "standout: +2.5% e1RM improvement without all-time best",
  "standout: metric mover sessions / tonnage",
  "standout: absent goal lift skipped",
  "standout: top-3 lift fallback by session count",
  "watchout: two-week e1RM slip",
  "watchout: none when steady and sessions hold",
  "special: bodyweight-only subject week",
  "special: welcome-back with Saturday week start",
  "data: deleted session recalculates subject",
  "data: re-dated workout moves week membership",
  "data: lb vs kg copy formatting independence (UI)",
  "eligibility: lookback older than 8 weeks ignored",
] as const;
