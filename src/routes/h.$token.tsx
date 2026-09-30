import { createFileRoute, Link } from "@tanstack/react-router";
import { HistoryLinkBody } from "@/components/app/history-log";
import { PaperShell } from "@/components/app/paper-shell";
import { Button } from "@/components/ui/button";
import { getHistoryView } from "@/lib/cloud/api";
import { siteOg } from "@/lib/og/tags";

export const Route = createFileRoute("/h/$token")({
  // A read-only history link (Opp 9). The first page is loaded before render; a bad or revoked token is carried to
  // the page, which says so. The card tags are the site's own and never repeat the token or anything from the log.
  loader: async ({ params, parentMatchPromise }) => {
    const origin = (await parentMatchPromise).loaderData?.origin ?? "";
    try {
      return { origin, result: await getHistoryView({ data: { token: params.token, offset: 0 } }) };
    } catch {
      return { origin, result: { ok: false as const, error: "This link doesn’t open a training log. It may have been revoked." } };
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      ...siteOg(loaderData?.origin ?? ""),
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: HistoryLinkPage,
});

function HistoryLinkPage() {
  const { result } = Route.useLoaderData();
  const { token } = Route.useParams();

  if (!result.ok) {
    return (
      <PaperShell kicker="Read-only log">
        <p className="text-sm text-muted" data-testid="history-missing">
          {result.error}
        </p>
        <Button className="mt-4" asChild>
          <Link to="/">Open Lock’d</Link>
        </Button>
      </PaperShell>
    );
  }

  return (
    <PaperShell kicker="Read-only log">
      <HistoryLinkBody view={result.view} token={token} />
    </PaperShell>
  );
}
