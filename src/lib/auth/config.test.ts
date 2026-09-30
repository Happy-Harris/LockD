import { describe, expect, it } from "vitest";
import { readAuthConfig, signInMethods } from "./config.server";

describe("sign-in configuration", () => {
  it("is off with nothing set, so Lock'd runs as a guest app", () => {
    expect(signInMethods(readAuthConfig({}))).toEqual([]);
  });

  it("is off without a secret, whatever providers are set", () => {
    const config = readAuthConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
    expect(signInMethods(config)).toEqual([]);
  });

  it("turns each method on only when all of its variables are set", () => {
    const base = { BETTER_AUTH_SECRET: "s" };
    expect(signInMethods(readAuthConfig({ ...base, GOOGLE_CLIENT_ID: "id" }))).toEqual([]);
    expect(signInMethods(readAuthConfig({ ...base, APPLE_CLIENT_ID: "id" }))).toEqual([]);
    expect(signInMethods(readAuthConfig({ ...base, RESEND_API_KEY: "key" }))).toEqual([]);
    expect(
      signInMethods(
        readAuthConfig({
          ...base,
          GOOGLE_CLIENT_ID: "g",
          GOOGLE_CLIENT_SECRET: "gs",
          APPLE_CLIENT_ID: "a",
          APPLE_CLIENT_SECRET: "as",
          RESEND_API_KEY: "r",
          AUTH_EMAIL_FROM: "Lockd <signin@example.com>",
        }),
      ),
    ).toEqual(["google", "apple", "email"]);
  });

  it("treats blank values as unset", () => {
    const config = readAuthConfig({ BETTER_AUTH_SECRET: "s", GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "x" });
    expect(config.google).toBeUndefined();
    expect(signInMethods(config)).toEqual([]);
  });

  it("carries the Apple bundle id only when it is set", () => {
    const withBundle = readAuthConfig({
      APPLE_CLIENT_ID: "a",
      APPLE_CLIENT_SECRET: "as",
      APPLE_APP_BUNDLE_IDENTIFIER: "app.lockd",
    });
    expect(withBundle.apple).toEqual({ clientId: "a", clientSecret: "as", appBundleIdentifier: "app.lockd" });
    expect(readAuthConfig({ APPLE_CLIENT_ID: "a", APPLE_CLIENT_SECRET: "as" }).apple).toEqual({
      clientId: "a",
      clientSecret: "as",
    });
  });
});
