import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sql: null as unknown, userId: "athlete-a" }));
vi.mock("@/lib/db", () => ({ getSql: async () => state.sql }));
vi.mock("@/lib/auth/middleware", () => ({ authMiddleware: {} }));
vi.mock("@/lib/auth/verify.server", () => ({ DEV_USER_ID: "dev-user" }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: (args: unknown) => unknown) => (args?: { data?: unknown }) =>
        fn({ context: { userId: state.userId }, data: args?.data }),
    };
    return builder;
  },
}));
import * as api from "./api";

const db = new PGlite();
beforeAll(async () => {
  await db.exec(readFileSync("migrations/0002_lockd_cloud.sql", "utf8"));
  // Old-format rows: one public by default, one deliberately private.
  await db.exec(`insert into lockd_profiles (user_id, handle, display_name, is_public)
    values ('old-public', 'oldpublic', 'Old public', true), ('old-private', 'oldprivate', 'Old private', false)`);
  await db.exec(readFileSync("migrations/0003_locker_privacy.sql", "utf8"));
  const query = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
  state.sql = Object.assign(
    (parts: TemplateStringsArray, ...params: unknown[]) =>
      query(
        parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""),
        params,
      ),
    { query },
  );
});
afterAll(() => db.close());

describe("locker privacy", () => {
  it("migrates existing public lockers to private with a persistent owner-only notice", async () => {
    state.userId = "old-public";
    expect((await api.pullVault()).profile).toMatchObject({
      isPublic: false,
      privacyNoticePending: true,
    });
    expect((await api.pullVault()).profile.privacyNoticePending).toBe(true);
    expect((await api.getLocker({ data: { handle: "oldpublic" } })).ok).toBe(false);
    await api.acknowledgePrivacyNotice();
    expect((await api.pullVault()).profile.privacyNoticePending).toBe(false);
    // Publishing on purpose also answers the notice.
    await db.exec(`update lockd_profiles set privacy_notice_pending = true where user_id = 'old-public'`);
    const { profile: noticed } = await api.pullVault();
    await api.saveProfile({ data: { ...noticed, isPublic: false } });
    expect((await api.pullVault()).profile.privacyNoticePending).toBe(true);
    await api.saveProfile({ data: { ...noticed, isPublic: true } });
    expect((await api.pullVault()).profile).toMatchObject({ isPublic: true, privacyNoticePending: false });
    state.userId = "old-private";
    expect((await api.pullVault()).profile).toMatchObject({
      isPublic: false,
      privacyNoticePending: false,
    });
  });

  it("creates private profiles and publishes only after explicit opt-in", async () => {
    state.userId = "athlete-a";
    const { profile } = await api.pullVault({ data: { displayName: "Athlete A" } });
    expect(profile.isPublic).toBe(false);
    expect((await api.getLocker({ data: { handle: profile.handle } })).ok).toBe(false);
    await api.saveProfile({ data: { ...profile, isPublic: true } });
    expect((await api.getLocker({ data: { handle: profile.handle } })).ok).toBe(true);
    await api.saveProfile({ data: { ...profile, isPublic: false } });
    expect((await api.getLocker({ data: { handle: profile.handle } })).ok).toBe(false);
    const inserted = await db.query<{ is_public: boolean }>(`insert into lockd_profiles
      (user_id, handle, display_name) values ('default-user', 'defaultuser', 'Default') returning is_public`);
    expect(inserted.rows[0].is_public).toBe(false);
  });

  it("only lets the owner unpublish a receipt and revokes the public URL", async () => {
    state.userId = "athlete-a";
    await db.exec(`insert into lockd_shares (id, user_id, kind, title, payload)
      values ('receipt-a', 'athlete-a', 'receipt', 'Receipt', '{}')`);
    state.userId = "athlete-b";
    expect((await api.unpublishShare({ data: { id: "receipt-a" } })).ok).toBe(false);
    expect((await api.getShare({ data: { id: "receipt-a" } })).ok).toBe(true);
    state.userId = "athlete-a";
    expect((await api.unpublishShare({ data: { id: "receipt-a" } })).ok).toBe(true);
    expect((await api.getShare({ data: { id: "receipt-a" } })).ok).toBe(false);
    expect(await api.listMyShares()).toEqual([]);
  });

  it("does not let the shared development identity access owner privacy operations", async () => {
    state.userId = "dev-user";
    await expect(api.pullVault()).rejects.toThrow("Sign in");
    await expect(
      api.saveProfile({ data: { handle: "devuser", displayName: "Dev", bio: "", isPublic: true } }),
    ).rejects.toThrow("Sign in");
    await expect(api.acknowledgePrivacyNotice()).rejects.toThrow("Sign in");
    await expect(api.unpublishShare({ data: { id: "receipt-a" } })).rejects.toThrow("Sign in");
  });
});
