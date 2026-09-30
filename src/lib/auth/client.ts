import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * The browser side of sign-in. Components read the user through `useCurrentUserState()`
 * (`./use-current-user`); which methods to offer comes from the server (`useSignInMethods()`).
 */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });

/** Google or Apple: a full-page redirect to the provider and back. */
export async function signInWith(
  provider: "google" | "apple",
  callbackURL = "/",
): Promise<void> {
  const { error } = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL: "/login" });
  if (error) throw new Error(error.message ?? "Sign-in failed.");
}

/** Email: sends a one-tap sign-in link. Resolves once the link is on its way. */
export async function sendEmailLink(email: string, callbackURL = "/"): Promise<void> {
  const { error } = await authClient.signIn.magicLink({ email, callbackURL, errorCallbackURL: "/login" });
  if (error) throw new Error(error.message ?? "The sign-in link could not be sent.");
}

export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed.");
  window.location.href = redirectTo;
}
