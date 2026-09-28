/**
 * Who may trigger a Lab model call. Pure so it can be tested without a database.
 *
 * The model is a second opinion for signed-in lifters; the deterministic read on /lab is the
 * Lab for everyone else. With sign-in disabled, `authMiddleware` resolves a shared dev user,
 * so that id is refused here: no deployment can expose an anonymous path to the provider key.
 */
export const DEFAULT_LAB_DAILY_LIMIT = 10;

export type LabGate = { ok: true } | { ok: false; error: string };

export function labDailyLimit(raw: string | undefined): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return DEFAULT_LAB_DAILY_LIMIT;
  return Number(raw.trim());
}

export function labGate(opts: {
  userId: string;
  devUserId: string;
  notesLast24h: number;
  limit: number;
}): LabGate {
  if (opts.userId === opts.devUserId) {
    return { ok: false, error: "Asking the Lab needs sign-in, which isn't enabled on this deployment." };
  }
  if (opts.notesLast24h >= opts.limit) {
    return { ok: false, error: `That's ${opts.limit} Lab questions in the last 24 hours. The local read above still works.` };
  }
  return { ok: true };
}
