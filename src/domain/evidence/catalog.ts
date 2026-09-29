import type { MuscleTargetBand } from "@/domain/types";
import type { EvidenceCatalog, EvidenceClaim, EvidenceSource } from "./types";

/** Product default for weekly credited sets per muscle. Kept stable on purpose; personal targets override it. */
export const RESEARCH_WEEKLY_SET_BAND: Readonly<MuscleTargetBand> = { min: 10, max: 20 };

/**
 * Sources are cited only where a claim leans on them, and every DOI here was resolved against
 * Crossref (and the PMID against PubMed) when it was added. Do not add a source from memory.
 * Sources with no DOI are pre-1990 practitioner material.
 *
 * Claims are only listed for behaviour Lock’d has today. Claims for behaviour that is not built
 * yet (double progression) come across with the feature that needs them, not before, so this layer
 * never describes something the app does not do.
 *
 * Last reviewed: 2026-09-29.
 */
export const EVIDENCE_SOURCES: readonly EvidenceSource[] = [
  {
    id: "schoenfeld-2017-volume",
    authors: "Schoenfeld BJ, Ogborn D, Krieger JW",
    year: 2017,
    title:
      "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis",
    venue: "Journal of Sports Sciences",
    doi: "10.1080/02640414.2016.1210197",
    pmid: "27433992",
    url: "https://doi.org/10.1080/02640414.2016.1210197",
    evidenceType: "meta_analysis",
  },
  {
    id: "pelland-2026-dose-response",
    authors: "Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC",
    year: 2026,
    title:
      "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains",
    venue: "Sports Medicine",
    doi: "10.1007/s40279-025-02344-w",
    pmid: "41343037",
    url: "https://doi.org/10.1007/s40279-025-02344-w",
    evidenceType: "meta_analysis",
  },
  {
    id: "currier-2026-acsm",
    authors: "Currier BS, et al.",
    year: 2026,
    title:
      "American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews",
    venue: "Medicine & Science in Sports & Exercise",
    doi: "10.1249/MSS.0000000000003897",
    url: "https://doi.org/10.1249/MSS.0000000000003897",
    evidenceType: "position_stand",
  },
  {
    id: "schoenfeld-2021-iusca",
    authors: "Schoenfeld BJ, et al.",
    year: 2021,
    title:
      "Resistance Training Recommendations to Maximize Muscle Hypertrophy in an Athletic Population: Position Stand of the IUSCA",
    venue: "International Journal of Strength and Conditioning",
    doi: "10.47206/ijsc.v1i1.81",
    url: "https://doi.org/10.47206/ijsc.v1i1.81",
    evidenceType: "position_stand",
  },
  {
    id: "epley-1985",
    authors: "Epley B",
    year: 1985,
    title: "Poundage Chart",
    venue: "Boyd Epley Workout (Body Enterprises)",
    evidenceType: "practitioner_manual",
  },
  {
    id: "brzycki-1993",
    authors: "Brzycki M",
    year: 1993,
    title: "Strength Testing—Predicting a One-Rep Max from Reps-to-Fatigue",
    venue: "Journal of Physical Education, Recreation & Dance",
    doi: "10.1080/07303084.1993.10606684",
    url: "https://doi.org/10.1080/07303084.1993.10606684",
    evidenceType: "practitioner_manual",
  },
];

export const EVIDENCE_CLAIMS: readonly EvidenceClaim[] = [
  {
    id: "weekly-volume-dose-response",
    statement:
      "Lock’d shows weekly hard sets per muscle because more weekly volume tends to build more muscle, with diminishing returns.",
    kind: "evidence_backed_default",
    behaviors: ["muscle_weekly_sets"],
    sourceIds: [
      "schoenfeld-2017-volume",
      "pelland-2026-dose-response",
      "currier-2026-acsm",
      "schoenfeld-2021-iusca",
    ],
    support: "context",
    interpretation:
      "Higher weekly set volume tends to grow muscle more than lower volume. Schoenfeld 2017 shows a graded dose-response, and Pelland 2026 models volume continuously rather than as fixed bands.",
    limitations:
      "This backs showing the count, not any particular number. The literature supports a positive dose-response and a lower region near 10 sets, and does not fix an upper limit for everyone.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "weekly-credited-sets-10-20",
    statement:
      "Muscle sets shows each muscle's credited sets for the week against a default band of 10 to 20 that the lifter can override per muscle.",
    kind: "implementation_heuristic",
    behaviors: ["research_muscle_target", "personal_target_fallback"],
    sourceIds: ["schoenfeld-2017-volume", "pelland-2026-dose-response"],
    support: "partial",
    interpretation:
      "More weekly set volume tends to build more muscle, with diminishing returns. Schoenfeld 2017 shows a graded dose-response, and Pelland 2026 models volume continuously rather than in fixed bands. The literature points to a lower region near 10 sets a week.",
    limitations:
      "The literature supports a positive dose-response and a lower region near 10 sets. It does not fix an upper limit of 20 for everyone. 10 to 20 is a stable product default so a lifter's existing training is not silently re-judged. A personal target overrides it, and a muscle with no mapped exercise is shown as unmapped rather than as low.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "secondary-set-credit-default",
    statement: "Secondary muscles receive a fractional credited set (default 0.5).",
    kind: "implementation_heuristic",
    behaviors: ["secondary_muscle_credit", "attributed_volume"],
    sourceIds: ["pelland-2026-dose-response"],
    support: "partial",
    interpretation:
      "Pelland 2026 finds fractional counting of indirect sets (0.5) fits dose-response data better than counting every indirect set as a full set. Lock’d’s default of 0.5 matches that spirit for credited-set accounting.",
    limitations:
      "Fractional credit is a product heuristic for attributed volume, not a claim that every secondary muscle receives half the stimulus of the primary. The value is stored in settings; no screen edits it yet.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "personal-muscle-targets",
    statement: "A lifter can save a target band for any muscle, and it replaces the default band for that muscle.",
    kind: "user_editable_personal",
    behaviors: ["personal_muscle_targets", "backup_restore_targets"],
    sourceIds: [],
    support: "context",
    interpretation:
      "Your own range, saved on this device, in backups and in the locker when you are signed in. It is your program, not a citation.",
    limitations:
      "Nothing checks a personal target against research: it is whatever you set, from 0 to 100 sets.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "e1rm-formulas",
    statement: "Estimated 1RM uses the Epley or Brzycki formula on completed loaded sets.",
    kind: "pure_calculation",
    behaviors: ["e1rm_chart", "records_e1rm"],
    sourceIds: ["epley-1985", "brzycki-1993"],
    support: "supports",
    interpretation:
      "Epley: weight × (1 + reps / 30). Brzycki: weight × 36 / (37 − reps). One rep is the load itself. Same canonical grams in and out.",
    limitations:
      "These are estimation formulas from practitioner literature, not direct strength measurements.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "e1rm-rep-cap-12",
    statement: "Sets above 12 reps are excluded from estimated 1RM.",
    kind: "implementation_heuristic",
    behaviors: ["e1rm_chart", "e1rm_rep_cap"],
    sourceIds: ["brzycki-1993"],
    support: "partial",
    interpretation:
      "High-rep sets are useful training data but make 1RM estimates too noisy to show as strength. Brzycki's chart was aimed at lower-rep fatigue sets; Lock’d caps at 12.",
    limitations:
      "The exact cap of 12 is a product reliability rule, not a universal scientific cutoff.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "tonnage-weight-times-reps",
    statement: "Tonnage is weight × reps summed over completed, non-warm-up sets of loaded lifts.",
    kind: "pure_calculation",
    behaviors: ["tonnage", "analytics_volume"],
    sourceIds: [],
    support: "supports",
    interpretation:
      "External-load accounting only. Bodyweight, duration, distance and assisted work are not counted, so they do not inflate tonnage.",
    limitations: "Pure arithmetic. Not a hypertrophy prescription.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "weekly-verdict-direction",
    statement:
      "The weekly verdict compares last week's hard sets with the mean of the three to four training weeks before it: up from +10%, a big jump above +50%, down from −10%, well down at −30% or worse, steady in between.",
    kind: "implementation_heuristic",
    behaviors: ["weekly_verdict"],
    sourceIds: [],
    support: "context",
    interpretation:
      "A product rule that turns the log into a plain direction. The baseline is up to four weeks in which something was logged, found within the eight weeks before last week; it needs three of them before it will say anything, and it pauses after three weeks away.",
    limitations:
      "The percentage bands and the window lengths are product choices, not sports-science criteria. A direction is not advice to change training.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "weekly-verdict-deload-shape",
    statement:
      "The weekly verdict treats a week as deload-shaped when hard sets fall below 60% of the baseline mean while the number of sessions stays at least the baseline's rounded mean.",
    kind: "implementation_heuristic",
    behaviors: ["weekly_verdict_deload"],
    sourceIds: [],
    support: "context",
    interpretation:
      "A product rule so a lighter planned week reads as recovery rather than a failed week. Under the Strength framing, a week whose goal-lift estimated 1RM held or rose is called an intensity block instead.",
    limitations:
      "The 60% threshold and the session floor are heuristics. They are not sports-science diagnostic criteria and not a deload protocol.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "weekly-verdict-spike-flag",
    statement:
      "A spike flag appears when last week's hard sets are more than 50% above the baseline mean.",
    kind: "implementation_heuristic",
    behaviors: ["weekly_verdict_spike", "training_change_flags"],
    sourceIds: [],
    support: "context",
    interpretation:
      "The flag reuses the weekly verdict's big-jump band, so the same logged work gives the same answer everywhere it is shown.",
    limitations:
      "The 50% threshold is a product attention rule. It is not a sports-science danger threshold or a recommendation to change training.",
    lastReviewed: "2026-09-29",
  },
  {
    id: "training-stall-flag",
    statement:
      "A stall flag compares the best valid estimated 1RM across at least three sessions in the last 28 local days with the same number of sessions before them.",
    kind: "implementation_heuristic",
    behaviors: ["training_stall_flag", "training_change_flags"],
    sourceIds: [],
    support: "context",
    interpretation:
      "The check uses the app's capped estimated 1RM and calls a stall only when the recent best is flat or lower. It is recomputed from logged sets each time.",
    limitations:
      "The 28-day window, the three-session minimum and the equal-count comparison are product heuristics. A flag is not a diagnosis, a program, or proof that adaptation has stopped.",
    lastReviewed: "2026-09-29",
  },
];

export const EVIDENCE_CATALOG: EvidenceCatalog = {
  sources: EVIDENCE_SOURCES,
  claims: EVIDENCE_CLAIMS,
};
