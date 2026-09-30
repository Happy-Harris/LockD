import type { SignInMethod } from "./methods";

/**
 * Which sign-in methods this deployment offers, read from its environment. Each method is on only
 * when everything it needs is set, and sign-in as a whole is on only with a `BETTER_AUTH_SECRET` and
 * at least one method. With none of it set, Lock'd runs as a guest app: the log stays on the device
 * and nothing asks anyone to sign in (plan § 5).
 *
 *   Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   Apple:  APPLE_CLIENT_ID (the Services ID), APPLE_CLIENT_SECRET (the signed client-secret JWT),
 *           optionally APPLE_APP_BUNDLE_IDENTIFIER for sign-in from the native app later
 *   Email:  RESEND_API_KEY and AUTH_EMAIL_FROM, for a one-tap sign-in link
 */
export interface AuthConfig {
  secret?: string;
  google?: { clientId: string; clientSecret: string };
  apple?: { clientId: string; clientSecret: string; appBundleIdentifier?: string };
  email?: { resendApiKey: string; from: string };
}

type Env = Record<string, string | undefined>;

const read = (env: Env, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};

export function readAuthConfig(env: Env): AuthConfig {
  const config: AuthConfig = {};
  const secret = read(env, "BETTER_AUTH_SECRET");
  if (secret) config.secret = secret;

  const googleId = read(env, "GOOGLE_CLIENT_ID");
  const googleSecret = read(env, "GOOGLE_CLIENT_SECRET");
  if (googleId && googleSecret) config.google = { clientId: googleId, clientSecret: googleSecret };

  const appleId = read(env, "APPLE_CLIENT_ID");
  const appleSecret = read(env, "APPLE_CLIENT_SECRET");
  if (appleId && appleSecret) {
    const bundle = read(env, "APPLE_APP_BUNDLE_IDENTIFIER");
    config.apple = {
      clientId: appleId,
      clientSecret: appleSecret,
      ...(bundle ? { appBundleIdentifier: bundle } : {}),
    };
  }

  const resendApiKey = read(env, "RESEND_API_KEY");
  const from = read(env, "AUTH_EMAIL_FROM");
  if (resendApiKey && from) config.email = { resendApiKey, from };
  return config;
}

/** The methods to offer, in button order. Empty when sign-in is off. */
export function signInMethods(config: AuthConfig): SignInMethod[] {
  if (!config.secret) return [];
  const methods: SignInMethod[] = [];
  if (config.google) methods.push("google");
  if (config.apple) methods.push("apple");
  if (config.email) methods.push("email");
  return methods;
}

export const authConfig = readAuthConfig(process.env);

/** True when sign-in is on: a secret and at least one method. */
export const authConfigured = signInMethods(authConfig).length > 0;
