import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { getSourcesForClaim, type EvidenceClaim, type EvidenceKind } from "@/domain/evidence";

const KIND_LABEL: Record<EvidenceKind, string> = {
  evidence_backed_default: "Research default",
  implementation_heuristic: "Implementation heuristic",
  user_editable_personal: "Personal target",
  pure_calculation: "Pure calculation",
};

/** What a number or rule rests on, and what it does not: the claim, its limits and its sources. */
export function ClaimEvidenceSheet({
  open,
  onClose,
  claim,
  title = "Research evidence",
}: {
  open: boolean;
  onClose: () => void;
  claim: EvidenceClaim;
  title?: string;
}) {
  const sources = getSourcesForClaim(claim.id);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description="What this number rests on, and what it does not."
      size="lg"
    >
      <div className="space-y-4 text-sm" data-testid="claim-evidence">
        <Card className="p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Claim</p>
          <p className="mt-1 font-medium text-ink">{claim.statement}</p>
          <p className="mt-2 inline-flex rounded-full bg-raised px-2 py-0.5 text-micro font-semibold text-muted">
            {KIND_LABEL[claim.kind]}
          </p>
        </Card>

        <section aria-labelledby="claim-interpretation">
          <h3 id="claim-interpretation" className="font-semibold text-ink">
            Interpretation
          </h3>
          <p className="mt-1 text-muted">{claim.interpretation}</p>
        </section>

        <section aria-labelledby="claim-limitations">
          <h3 id="claim-limitations" className="font-semibold text-ink">
            Limits
          </h3>
          <p className="mt-1 text-muted">{claim.limitations}</p>
        </section>

        <section aria-labelledby="claim-sources">
          <h3 id="claim-sources" className="font-semibold text-ink">
            Sources
          </h3>
          {sources.length === 0 ? (
            <p className="mt-1 text-muted">No publication attached. This is a product rule.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {sources.map((source) => (
                <li key={source.id} className="rounded-lg bg-raised px-3 py-2 text-xs">
                  <p className="font-semibold text-ink">
                    {source.authors} ({source.year})
                  </p>
                  <p className="mt-0.5 text-muted">{source.title}</p>
                  <p className="mt-0.5 text-subtle">{source.venue}</p>
                  {source.doi ? (
                    <p className="mt-1 font-mono text-micro text-accent">
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">
                          doi:{source.doi}
                        </a>
                      ) : (
                        <>doi:{source.doi}</>
                      )}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-micro text-subtle">Last reviewed {claim.lastReviewed}</p>
        </section>
      </div>
    </Sheet>
  );
}
