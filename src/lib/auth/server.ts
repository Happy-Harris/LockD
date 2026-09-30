/**
 * Lock'd's own Better Auth, served at `/api/auth/*` (server-only; never import it from client code,
 * it pulls in `pg`). Sign-in goes straight to each provider: Google and Apple through their own
 * OAuth apps, and email through a one-tap link. Which of them are on comes from the environment
 * (`./config.server`); with none set, sign-in is off and Lock'd is a guest app.
 *
 * Sessions and identities persist in Postgres when `DATABASE_URL` is set, otherwise in the embedded
 * PGLite (fine for local development; it does not survive a restart on a serverless host).
 */
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { authConfig, authConfigured } from "./config.server";
import { sendSignInLink } from "./email.server";
import { pgliteDialect } from "./pglite-dialect";

export { authConfigured };

void ensureDbReady();

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

/**
 * Better Auth needs a secret to start even with sign-in off. Then nothing is ever signed with it,
 * so a per-process one is enough. It lives on `globalThis` so a dev-server reload keeps sessions.
 */
const globalRef = globalThis as typeof globalThis & { __lockdAuthSecret__?: string };
function processSecret(): string {
  globalRef.__lockdAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalRef.__lockdAuthSecret__;
}

// The public URL when deployed. Locally, the origin of the request on the loopback hosts.
const LOCAL_DEV_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"];
const explicitBaseURL = env("BETTER_AUTH_URL");
const baseURL = explicitBaseURL ?? {
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

const trustedOrigins = [
  ...(explicitBaseURL ? [explicitBaseURL] : []),
  ...LOCAL_DEV_ORIGINS,
  // Apple returns to the callback with a cross-site form POST.
  ...(authConfig.apple ? ["https://appleid.apple.com"] : []),
];

const databaseUrl = env("DATABASE_URL");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name. `__Host-` stops any other site setting it with a `Domain`. */
export const SESSION_TOKEN_COOKIE = "__Host-lockd.session_token";

const socialProviders = {
  ...(authConfig.google
    ? {
        google: {
          clientId: authConfig.google.clientId,
          clientSecret: authConfig.google.clientSecret,
          prompt: "select_account" as const,
        },
      }
    : {}),
  ...(authConfig.apple
    ? {
        apple: {
          clientId: authConfig.apple.clientId,
          clientSecret: authConfig.apple.clientSecret,
          ...(authConfig.apple.appBundleIdentifier
            ? { appBundleIdentifier: authConfig.apple.appBundleIdentifier }
            : {}),
        },
      }
    : {}),
};

const email = authConfig.email;

export const auth = betterAuth({
  baseURL,
  secret: authConfig.secret ?? processSecret(),
  database,
  trustedOrigins,
  socialProviders,
  account: {
    encryptOAuthTokens: true,
    // One person, one log: Google or Apple and an email link to the same verified address reach
    // the same account.
    accountLinking: { enabled: true, trustedProviders: ["google", "apple"] },
  },
  // Session reads come from a short-lived signed cookie, so most page loads skip the database.
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-lockd.session_data" },
      account_data: { name: "__Host-lockd.account_data" },
      dont_remember: { name: "__Host-lockd.dont_remember" },
    },
  },
  plugins: [
    ...(email
      ? [
          magicLink({
            storeToken: "hashed",
            sendMagicLink: ({ email: to, url }) =>
              sendSignInLink({ apiKey: email.resendApiKey, from: email.from, to, url }),
          }),
        ]
      : []),
    // Bridges Better Auth's Set-Cookie into TanStack Start responses. Must be last.
    tanstackStartCookies(),
  ],
});
