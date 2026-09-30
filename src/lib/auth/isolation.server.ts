import { getRequest } from "@tanstack/react-start/server";

/**
 * Fetch-Metadata request isolation (server-only; keep the `.server` suffix, since it imports
 * `@tanstack/react-start/server` and must never reach the browser bundle).
 *
 * A `SameSite=Lax` session cookie still rides on same-site subrequests, so a page on a sibling
 * subdomain could script a request to these server functions with the lifter's session. Allowed:
 * same-origin requests (this app's own client), non-browser requests (SSR and server-to-server send
 * no `Sec-Fetch-Site`), and top-level GET navigations (how page loads and the OAuth callback
 * arrive). Every other cross-site or same-site scripted request is refused. Enforced at the
 * `authMiddleware` chokepoint (see `middleware.ts`).
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/** Throw `CrossSiteRequestError` for a scripted cross-site/sibling request. */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return; // no request context (e.g. build) — nothing to guard
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  // Non-browser client (no header), the app's own origin, or a direct
  // (address-bar/bookmark) load are all fine.
  if (!site || site === "same-origin" || site === "none") return;
  // A top-level GET navigation (e.g. an OAuth callback redirect) is
  // fine even when it's cross-site; scripted requests never set navigate mode.
  const dest = h.get("sec-fetch-dest");
  const isTopLevelGet =
    h.get("sec-fetch-mode") === "navigate" &&
    request.method === "GET" &&
    dest !== "object" &&
    dest !== "embed";
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}
