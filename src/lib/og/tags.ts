import type { PublicShare } from "@/lib/cloud/types";

/**
 * The share-card and page-title tags every screen carries, built as data for the routes' `head`. They were
 * injected by the app-builder middleware into the streamed HTML; now each route states them, so crawlers get them
 * from the server-rendered page and nothing is fetched from a third-party card service.
 *
 * A public page only ever repeats what the page itself shows anyone who opens it: a share's own title, a public
 * locker's display name. Nothing from a signed-in lifter's log goes into a tag.
 */
export const SITE_NAME = "Lock’d";
export const SITE_DESCRIPTION =
  "Lock’d — a training operating system that remembers a lifting life. Keep the receipt.";
/** Drawn by `scripts/make-icons.mjs` from `src/lib/brand.ts`. 1200 x 630. */
export const OG_IMAGE_PATH = "/og.png";

export type MetaTag = Record<string, string>;

export interface OgInput {
  /** `https://host`, no trailing slash. Empty when unknown (then image and url stay relative). */
  origin: string;
  path: string;
  title: string;
  description: string;
}

export function absoluteUrl(origin: string, path: string): string {
  const clean = origin.replace(/\/+$/, "");
  return `${clean}${path.startsWith("/") ? path : `/${path}`}`;
}

export function ogMeta({ origin, path, title, description }: OgInput): MetaTag[] {
  return [
    { title },
    { name: "description", content: description },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: absoluteUrl(origin, path) },
    { property: "og:image", content: absoluteUrl(origin, OG_IMAGE_PATH) },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: absoluteUrl(origin, OG_IMAGE_PATH) },
  ];
}

export function siteOg(origin: string, path = "/"): MetaTag[] {
  return ogMeta({ origin, path, title: SITE_NAME, description: SITE_DESCRIPTION });
}

/** The web receipt (`/receipt`, Opp 2): the same card for everyone, since the page holds no one's data until a file is dropped. */
export function receiptOg(origin: string): MetaTag[] {
  return ogMeta({
    origin,
    path: "/receipt",
    title: `Your training receipt · ${SITE_NAME}`,
    description:
      "Drop a Strong or Hevy export and read your whole training life back. It stays on your device; no account needed.",
  });
}

const KIND_LINE: Record<PublicShare["kind"], string> = {
  moment: "A moment from a lifter’s record, kept on Lock’d.",
  receipt: "A session receipt, kept on Lock’d.",
  wrapped: "A year in the log, kept on Lock’d.",
  program: "A training block, shared on Lock’d.",
};

/** A public share (`/s/$id`): its own title and a line by kind. No numbers from the payload. */
export function shareOg(
  origin: string,
  id: string,
  share: Pick<PublicShare, "title" | "kind"> | null,
): MetaTag[] {
  if (!share) return siteOg(origin, `/s/${id}`);
  const title = `${share.title} · ${SITE_NAME}`;
  return ogMeta({ origin, path: `/s/${id}`, title, description: KIND_LINE[share.kind] });
}

/** A public locker (`/u/$handle`): the display name and handle the page itself shows. Bio is not repeated. */
export function lockerOg(
  origin: string,
  handle: string,
  card: { displayName: string; handle: string } | null,
): MetaTag[] {
  if (!card) return siteOg(origin, `/u/${handle}`);
  const title = `${card.displayName} (@${card.handle}) · ${SITE_NAME}`;
  return ogMeta({
    origin,
    path: `/u/${card.handle}`,
    title,
    description: `${card.displayName}’s public locker on Lock’d. Keep the receipt.`,
  });
}
