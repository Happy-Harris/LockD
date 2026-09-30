import { getRequest } from "@tanstack/react-start/server";

/**
 * The public origin of this request (`https://host`), for absolute og:image and og:url. Behind a proxy the
 * forwarded headers say what the visitor typed; without them the request's own URL is used. Server only.
 */
export function requestOrigin(): string {
  const request = getRequest();
  if (!request) return "";
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = (request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", ""))
    .split(",")[0]!
    .trim();
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host)
    ? `${proto === "http" ? "http" : "https"}://${host}`
    : "";
}
