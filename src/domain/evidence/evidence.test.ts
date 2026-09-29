import { describe, expect, it } from "vitest";
import { FORMULA_LABEL, MAX_E1RM_REPS } from "../oneRepMax";
import { defaultSettings } from "@/lib/gym/store";
import {
  assertCatalogIntegrity,
  EVIDENCE_CATALOG,
  EVIDENCE_CLAIMS,
  EVIDENCE_SOURCES,
  getClaim,
  getClaimsForBehavior,
  getSource,
  getSourcesForClaim,
  listClaimsByKind,
  type EvidenceCatalog,
} from "./index";

const BANNED = /\b(rep\s?forge|strong[\s-]?pro|certified|knurl|grok)\b/i;

describe("evidence catalog", () => {
  it("keeps referential integrity", () => {
    expect(() => assertCatalogIntegrity()).not.toThrow();
  });

  it("rejects a claim that cites a source that is not in the catalog", () => {
    const broken: EvidenceCatalog = {
      sources: [],
      claims: [{ ...EVIDENCE_CLAIMS[0]!, sourceIds: ["nope"] }],
    };
    expect(() => assertCatalogIntegrity(broken)).toThrow(/missing source nope/);
  });

  it("rejects duplicate ids", () => {
    const dupSource: EvidenceCatalog = {
      sources: [EVIDENCE_SOURCES[0]!, EVIDENCE_SOURCES[0]!],
      claims: [],
    };
    expect(() => assertCatalogIntegrity(dupSource)).toThrow(/Duplicate evidence source id/);
    const dupClaim: EvidenceCatalog = {
      sources: EVIDENCE_SOURCES,
      claims: [EVIDENCE_CLAIMS[0]!, EVIDENCE_CLAIMS[0]!],
    };
    expect(() => assertCatalogIntegrity(dupClaim)).toThrow(/Duplicate evidence claim id/);
  });

  it("cites every source somewhere, so nothing is listed without a claim behind it", () => {
    const cited = new Set(EVIDENCE_CLAIMS.flatMap((claim) => claim.sourceIds));
    for (const source of EVIDENCE_SOURCES) expect(cited.has(source.id), source.id).toBe(true);
  });

  it("gives every source a well-formed DOI unless it is pre-1990 practitioner material", () => {
    for (const source of EVIDENCE_SOURCES) {
      if (source.doi) {
        expect(source.doi, source.id).toMatch(/^10\.\d{4,9}\/\S+$/);
        expect(source.url, source.id).toBe(`https://doi.org/${source.doi}`);
      } else {
        expect(source.year, source.id).toBeLessThan(1990);
      }
    }
  });

  it("never lets a heuristic or a plain calculation pose as research", () => {
    for (const claim of EVIDENCE_CLAIMS) {
      if (claim.kind === "evidence_backed_default")
        expect(claim.sourceIds.length, claim.id).toBeGreaterThan(0);
      if (claim.kind === "implementation_heuristic")
        expect(claim.limitations.length, claim.id).toBeGreaterThan(0);
    }
    expect(getSourcesForClaim("weekly-verdict-direction")).toEqual([]);
    expect(getSourcesForClaim("personal-muscle-targets")).toEqual([]);
    expect(getClaim("weekly-credited-sets-10-20")?.kind).toBe("implementation_heuristic");
    expect(getClaim("personal-muscle-targets")?.kind).toBe("user_editable_personal");
    expect(getClaim("weekly-verdict-direction")?.kind).toBe("implementation_heuristic");
    expect(getClaim("e1rm-formulas")?.kind).toBe("pure_calculation");
    expect(getClaim("tonnage-weight-times-reps")?.kind).toBe("pure_calculation");
  });

  it("keeps former brand names out of everything a lifter can read", () => {
    const text = JSON.stringify(EVIDENCE_CLAIMS);
    expect(BANNED.test(text)).toBe(false);
  });

  it("looks claims and sources up by id, behaviour and kind", () => {
    expect(getSource("epley-1985")?.year).toBe(1985);
    expect(getSource("missing")).toBeUndefined();
    expect(getClaim("missing")).toBeUndefined();
    expect(getSourcesForClaim("missing")).toEqual([]);
    expect(getClaimsForBehavior("weekly_verdict").map((claim) => claim.id)).toEqual([
      "weekly-verdict-direction",
    ]);
    expect(listClaimsByKind("pure_calculation").map((claim) => claim.id)).toEqual([
      "e1rm-formulas",
      "tonnage-weight-times-reps",
    ]);
    expect(EVIDENCE_CATALOG.claims).toBe(EVIDENCE_CLAIMS);
  });
});

// The claims quote the app's own numbers. If the code moves, these fail and the words get fixed.
describe("evidence claims match the code they describe", () => {
  it("names the e1RM rep cap the code uses", () => {
    expect(getClaim("e1rm-rep-cap-12")!.statement).toContain(`above ${MAX_E1RM_REPS} reps`);
    expect(getClaim("e1rm-rep-cap-12")!.id).toBe(`e1rm-rep-cap-${MAX_E1RM_REPS}`);
  });

  it("names both e1RM formulas the app offers", () => {
    const statement = getClaim("e1rm-formulas")!.statement;
    for (const label of Object.values(FORMULA_LABEL)) expect(statement).toContain(label);
  });

  it("quotes the default secondary credit the store ships", () => {
    expect(getClaim("secondary-set-credit-default")!.statement).toContain(
      `default ${defaultSettings().secondaryMuscleCredit}`,
    );
  });
});
