import { useRouteContext } from "@tanstack/react-router";
import { authClient } from "./client";
import type { SignInMethod } from "./methods";

/**
 * The signed-in lifter, or `null` for a guest. Guests are first-class: the log lives on the device
 * and nothing here gates logging.
 */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
};

export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.name ?? null,
          primaryEmail: user.email ?? null,
          profileImageUrl: user.image ?? null,
        }
      : null,
    isPending,
  };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}

/**
 * The sign-in methods this deployment offers, as the server reported them when the page loaded.
 * Empty when sign-in is off: then every "Sign in" prompt is hidden, not shown disabled.
 */
export function useSignInMethods(): readonly SignInMethod[] {
  return useRouteContext({ from: "__root__", select: (context) => context.signInMethods });
}

export function useCanSignIn(): boolean {
  return useSignInMethods().length > 0;
}
