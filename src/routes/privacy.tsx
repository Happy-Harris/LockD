import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/app/legal-page";
import { PRIVACY_SECTIONS } from "@/lib/legal/content";
import { ogMeta } from "@/lib/og/tags";

/** Public, no account needed (web readiness gap 3). The wording lives in `src/lib/legal/content.ts`. */
export const Route = createFileRoute("/privacy")({
  loader: async ({ parentMatchPromise }) => ({
    origin: (await parentMatchPromise).loaderData?.origin ?? "",
  }),
  head: ({ loaderData }) => ({
    meta: ogMeta({
      origin: loaderData?.origin ?? "",
      path: "/privacy",
      title: "Privacy policy · Lock’d",
      description: "How Lock’d handles your training record.",
    }),
  }),
  component: () => <LegalPage title="Privacy policy" sections={PRIVACY_SECTIONS} />,
});
