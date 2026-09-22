import { createFileRoute, Link } from "@tanstack/react-router";
import { MomentPoster, downloadPosterPng } from "@/components/app/moment-poster";
import { PublishButton } from "@/components/app/publish-button";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { weightUnitFor } from "@/domain/units";
import { momentShare } from "@/lib/cloud/shares";
import { useGymDerived } from "@/lib/gym/hooks";

export const Route = createFileRoute("/moments/$id")({ component: MomentPage });

function MomentPage() {
  const { id } = Route.useParams();
  const { moments, settings } = useGymDerived();
  const moment = moments.find((row) => row.id === id);
  const unit = weightUnitFor(settings.unitSystem);

  if (!moment) {
    return (
      <Page>
        <p className="text-sm text-muted">That moment is not on file.</p>
        <Button className="mt-4" asChild>
          <Link to="/chronicle">Chronicle</Link>
        </Button>
      </Page>
    );
  }

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Moment</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">A stamp, not a notification.</h1>
      <div className="mt-6">
        <MomentPoster moment={moment} unit={unit} />
      </div>
      <div className="mt-6 space-y-2">
        <PublishButton kind="moment" title={moment.title} payload={momentShare(moment, unit)} label="Share moment link" />
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => downloadPosterPng(`lockd-${moment.id}.png`, moment)}
        >
          Download poster
        </Button>
        <Button className="w-full" asChild>
          <Link to="/chronicle">Chronicle</Link>
        </Button>
      </div>
    </Page>
  );
}
