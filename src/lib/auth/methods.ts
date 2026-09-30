/**
 * The ways a lifter can sign in, shared by the server (which turns each on from its environment)
 * and the client (which shows a button for each one the server reports). No server imports here,
 * so the browser bundle can use it.
 */
export type SignInMethod = "google" | "apple" | "email";

export const SIGN_IN_METHODS: readonly SignInMethod[] = ["google", "apple", "email"];

export const SIGN_IN_LABELS: Record<SignInMethod, string> = {
  google: "Google",
  apple: "Apple",
  email: "email",
};
