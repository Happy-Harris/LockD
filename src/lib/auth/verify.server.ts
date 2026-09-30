import { getRequest } from "@tanstack/react-start/server";
import { auth, authConfigured } from "./server";

/**
 * Verifies the caller's session on the server. Use `authMiddleware` in server functions; this is
 * what it calls.
 *
 * With sign-in off there are no accounts. Locally (no `DATABASE_URL`) `requireUserId` resolves a
 * shared dev user, which the cloud and the Lab refuse by id, so no deployment can reach per-user
 * data or the Lab's provider key without signing in. With a database set it fails closed instead.
 */
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

export { authConfigured };

if (databaseConfigured && !authConfigured) {
  console.error(
    "[auth] DATABASE_URL is set but no sign-in method is configured: requireUserId() will reject " +
      "every request rather than share one dev user on a real database.",
  );
}

export const DEV_USER_ID = "dev-user";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

export async function getSessionUser(): Promise<VerifiedUser | null> {
  if (!authConfigured) return null;
  const request = getRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

export async function requireUserId(): Promise<string> {
  if (!authConfigured) {
    if (databaseConfigured) {
      throw new Error(
        "Sign-in is not configured but DATABASE_URL is set: refusing to fall back to the shared " +
          "dev user against a real database.",
      );
    }
    return DEV_USER_ID;
  }
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
