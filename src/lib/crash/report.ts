/**
 * Crash reporting (web readiness gap 12; owner's decision 2026-10-01: Sentry, the error and the page only). Off unless
 * the build sets `VITE_SENTRY_DSN`, and with it unset the Sentry code is never even downloaded.
 *
 * What a report carries: the error's type, message and stack, the page path with any share id, handle or history
 * token replaced, and the browser and system names Sentry reads from the user agent. What it never carries: anything
 * from the log, the lifter's email or account id, IP address, cookies, request headers, query strings, or
 * breadcrumbs (the trail of clicks, console lines and requests before the error, which can hold exercise names and
 * notes). Every event goes through `scrubEvent` before it leaves the device.
 */
import type { ErrorEvent, EventHint } from "@sentry/browser";

/**
 * Read once, as a literal Vite replaces at build time: with no DSN the import below is dead code, so the Sentry chunk is
 * not built at all and the service worker never caches it.
 */
const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() || undefined;

export function crashReportingDsn(): string | undefined {
  return DSN;
}

/** Public paths whose second segment identifies someone or opens their data. */
const IDENTIFYING_SEGMENT = /\/(s|u|h)\/[^/?#\s"'):]+/g;
const PLACEHOLDER: Record<string, string> = { s: ":id", u: ":handle", h: ":token" };

/** Replaces share ids, handles and history tokens anywhere in a string (a path, a URL, a message, a stack line). */
export function scrubText(text: string): string {
  return text.replace(
    IDENTIFYING_SEGMENT,
    (_match, kind: string) => `/${kind}/${PLACEHOLDER[kind]}`,
  );
}

/** A URL reduced to its scrubbed path: no origin, no query string, no fragment. */
export function scrubUrl(url: string): string {
  try {
    return scrubText(new URL(url, "http://x").pathname);
  } catch {
    return scrubText(url.split(/[?#]/)[0] ?? "");
  }
}

export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  const exception = event.exception?.values?.map((value) => ({
    ...value,
    value: value.value === undefined ? undefined : scrubText(value.value),
    stacktrace: value.stacktrace && {
      ...value.stacktrace,
      frames: value.stacktrace.frames?.map((frame) => ({
        ...frame,
        filename: frame.filename && scrubText(frame.filename),
        abs_path: frame.abs_path && scrubText(frame.abs_path),
        vars: undefined,
      })),
    },
  }));
  return {
    event_id: event.event_id,
    type: event.type,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    sdk: event.sdk,
    message: event.message === undefined ? undefined : scrubText(event.message),
    exception: exception ? { values: exception } : undefined,
    request: event.request?.url ? { url: scrubUrl(event.request.url) } : undefined,
    transaction: event.transaction === undefined ? undefined : scrubText(event.transaction),
    contexts: {
      ...(event.contexts?.browser ? { browser: event.contexts.browser } : {}),
      ...(event.contexts?.os ? { os: event.contexts.os } : {}),
    },
  };
}

type Reporter = { captureException: (error: unknown) => void };
let reporter: Promise<Reporter | null> | null = null;

/** Starts reporting once, after the log has loaded, so it never slows the first screen. */
export function startCrashReporting(): Promise<Reporter | null> {
  if (!DSN || typeof window === "undefined") return Promise.resolve(null);
  const dsn = DSN;
  reporter ??= import("@sentry/browser")
    .then(({ init, captureException }) => {
      init({
        dsn,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        maxBreadcrumbs: 0,
        beforeBreadcrumb: () => null,
        beforeSend: scrubEvent,
        integrations: (defaults) =>
          defaults.filter((integration) => integration.name !== "Breadcrumbs"),
      });
      return { captureException } satisfies Reporter;
    })
    .catch(() => null);
  return reporter;
}

/** For errors the app catches itself (a screen that failed to render); uncaught ones are picked up on their own. */
export function reportError(error: unknown): void {
  void startCrashReporting().then((sentry) => sentry?.captureException(error));
}
