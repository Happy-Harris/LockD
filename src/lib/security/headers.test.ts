import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, reportOriginFromDsn, SECURITY_HEADERS } from "./headers";

describe("security headers", () => {
  it("allow only Lock'd's own origin by default", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("connect-src 'self';");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  it("let crash reports out to the Sentry host only when a DSN is set, without the key", () => {
    const origin = reportOriginFromDsn("https://publickey@o123.ingest.sentry.io/456");
    expect(origin).toBe("https://o123.ingest.sentry.io");
    expect(contentSecurityPolicy(origin)).toContain("connect-src 'self' https://o123.ingest.sentry.io;");
    expect(contentSecurityPolicy(origin)).not.toContain("publickey");
    expect(reportOriginFromDsn(undefined)).toBeUndefined();
    expect(reportOriginFromDsn("  ")).toBeUndefined();
    expect(reportOriginFromDsn("http://insecure@host/1")).toBeUndefined();
    expect(reportOriginFromDsn("not a url")).toBeUndefined();
  });
});
