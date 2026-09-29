import { EVIDENCE_CATALOG, EVIDENCE_CLAIMS, EVIDENCE_SOURCES } from "./catalog";
import type { EvidenceClaim, EvidenceSource } from "./types";

export type {
  ClaimSourceSupport,
  EvidenceCatalog,
  EvidenceClaim,
  EvidenceKind,
  EvidenceSource,
  EvidenceType,
} from "./types";
export {
  EVIDENCE_CATALOG,
  EVIDENCE_CLAIMS,
  EVIDENCE_SOURCES,
  RESEARCH_WEEKLY_SET_BAND,
} from "./catalog";

const sourceById = new Map<string, EvidenceSource>(
  EVIDENCE_SOURCES.map((source) => [source.id, source]),
);
const claimById = new Map<string, EvidenceClaim>(EVIDENCE_CLAIMS.map((claim) => [claim.id, claim]));

export function getClaim(id: string): EvidenceClaim | undefined {
  return claimById.get(id);
}

export function getSource(id: string): EvidenceSource | undefined {
  return sourceById.get(id);
}

export function getSourcesForClaim(claimId: string): EvidenceSource[] {
  const claim = claimById.get(claimId);
  if (!claim) return [];
  return claim.sourceIds
    .map((id) => sourceById.get(id))
    .filter((source): source is EvidenceSource => source !== undefined);
}

export function getClaimsForBehavior(behavior: string): EvidenceClaim[] {
  return EVIDENCE_CLAIMS.filter((claim) => claim.behaviors.includes(behavior));
}

export function listClaimsByKind(kind: EvidenceClaim["kind"]): EvidenceClaim[] {
  return EVIDENCE_CLAIMS.filter((claim) => claim.kind === kind);
}

/** Throws if a claim cites a source that is not in the catalog, or an id is used twice. */
export function assertCatalogIntegrity(catalog = EVIDENCE_CATALOG): void {
  const sourceIds = catalog.sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("Duplicate evidence source id");
  const claimIds = catalog.claims.map((claim) => claim.id);
  if (new Set(claimIds).size !== claimIds.length) throw new Error("Duplicate evidence claim id");
  const known = new Set(sourceIds);
  for (const claim of catalog.claims) {
    for (const sourceId of claim.sourceIds) {
      if (!known.has(sourceId))
        throw new Error(`Claim ${claim.id} references missing source ${sourceId}`);
    }
  }
}

/** The claim behind the default weekly band on Muscle sets. It must exist: the screen links to it. */
export function researchMuscleTargetClaim(): EvidenceClaim {
  const claim = getClaim("weekly-credited-sets-10-20");
  if (!claim) throw new Error("The weekly credited sets claim is missing from the evidence catalog.");
  return claim;
}
