/**
 * Structured evidence layer: every explanation a number carries points at a claim, and every claim
 * says what kind of thing it is (research-backed default, product heuristic, user setting, or
 * plain arithmetic) and which sources, if any, stand behind it.
 */

export type EvidenceKind =
  | "evidence_backed_default"
  | "implementation_heuristic"
  | "user_editable_personal"
  | "pure_calculation";

export type EvidenceType =
  | "meta_analysis"
  | "systematic_review"
  | "position_stand"
  | "primary_study"
  | "practitioner_manual"
  | "product_rule";

export type ClaimSourceSupport = "supports" | "partial" | "context";

export interface EvidenceSource {
  id: string;
  authors: string;
  year: number;
  title: string;
  venue: string;
  doi?: string;
  pmid?: string;
  url?: string;
  evidenceType: EvidenceType;
}

export interface EvidenceClaim {
  id: string;
  /** Plain-language claim shown in UI. */
  statement: string;
  kind: EvidenceKind;
  /** Product behaviors that depend on this claim. */
  behaviors: readonly string[];
  sourceIds: readonly string[];
  /** How strongly the linked sources underwrite the claim. */
  support: ClaimSourceSupport;
  interpretation: string;
  limitations: string;
  lastReviewed: string; // YYYY-MM-DD
}

export interface EvidenceCatalog {
  sources: readonly EvidenceSource[];
  claims: readonly EvidenceClaim[];
}
