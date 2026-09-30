import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { vault } from "./history-link.test";

const state = vi.hoisted(() => ({ sql: null as unknown, userId: "athlete-a" }));
vi.mock("@/lib/db", () => ({ getSql: async () => state.sql }));
vi.mock("@/lib/auth/middleware", () => ({ authMiddleware: {} }));
vi.mock("@/lib/auth/verify.server", () => ({ DEV_USER_ID: "dev-user" }));
vi.mock("@tanstack/react-start", () => ({
  // Runs the declared validator first, as the server does.
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const builder = {
      middleware: () => builder,
      validator: (fn: (input: unknown) => unknown) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args?: { data?: unknown }) =>
        fn({ context: { userId: state.userId }, data: validate(args?.data) }),
    };
    return builder;
  },
}));
import * as api from "./api";
import { MAX_HISTORY_LINKS } from "./history-link";
import { validateHistoryTokenInput } from "./validate";

/** Opp 9: read-only history links against the real migrations. */
const db = new PGlite();
beforeAll(async () => {
  for (const file of ["0002_lockd_cloud.sql", "0003_locker_privacy.sql", "0004_history_links.sql"]) {
    await db.exec(readFileSync(`migrations/${file}`, "utf8"));
  }
  const query = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
  state.sql = Object.assign(
    (parts: TemplateStringsArray, ...params: unknown[]) =>
      query(
        parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""),
        params,
      ),
    { query },
  );
  await db.query(`insert into lockd_vaults (user_id, payload) values ('athlete-a', $1::jsonb)`, [JSON.stringify(vault)]);
});
afterAll(() => db.close());

describe("read-only history links", () => {
  it("opens the owner's history for anyone holding the link, and nothing else", async () => {
    state.userId = "athlete-a";
    const created = await api.createHistoryLink({ data: { label: "Coach" } });
    if (!created.ok) throw new Error(created.error);
    expect(created.link.label).toBe("Coach");
    expect(created.link.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    state.userId = "";
    const opened = await api.getHistoryView({ data: { token: created.link.token, offset: 0 } });
    if (!opened.ok) throw new Error(opened.error);
    expect(opened.view.totalSessions).toBe(2);
    const text = JSON.stringify(opened);
    for (const secret of ["athlete-a", "Coach", "private note", "Private Name", "lab note"]) expect(text).not.toContain(secret);
  });

  it("only the owner lists and revokes a link, and a revoked link stops resolving", async () => {
    state.userId = "athlete-a";
    const created = await api.createHistoryLink({ data: { label: "Partner" } });
    if (!created.ok) throw new Error(created.error);
    const token = created.link.token;
    expect((await api.listHistoryLinks()).map((row) => row.label)).toContain("Partner");

    state.userId = "athlete-b";
    expect(await api.listHistoryLinks()).toEqual([]);
    expect((await api.revokeHistoryLink({ data: { token } })).ok).toBe(false);
    expect((await api.getHistoryView({ data: { token, offset: 0 } })).ok).toBe(true);

    state.userId = "athlete-a";
    expect((await api.revokeHistoryLink({ data: { token } })).ok).toBe(true);
    expect((await api.getHistoryView({ data: { token, offset: 0 } })).ok).toBe(false);
    expect((await api.listHistoryLinks()).map((row) => row.label)).not.toContain("Partner");
  });

  it("gives an unknown token and an owner with no synced log the same answer", async () => {
    const unknown = await api.getHistoryView({ data: { token: "a".repeat(43), offset: 0 } });
    state.userId = "athlete-c";
    const created = await api.createHistoryLink({ data: {} });
    if (!created.ok) throw new Error(created.error);
    const empty = await api.getHistoryView({ data: { token: created.link.token, offset: 0 } });
    expect(unknown).toEqual(empty);
    expect(unknown.ok).toBe(false);
  });

  it("caps how many live links one lifter holds", async () => {
    state.userId = "athlete-d";
    for (let i = 0; i < MAX_HISTORY_LINKS; i += 1) expect((await api.createHistoryLink({ data: {} })).ok).toBe(true);
    expect(await api.createHistoryLink({ data: {} })).toMatchObject({ ok: false });
  });

  it("refuses the shared development identity and anything that is not a token", async () => {
    state.userId = "dev-user";
    await expect(api.createHistoryLink({ data: {} })).rejects.toThrow("Sign in");
    await expect(api.listHistoryLinks()).rejects.toThrow("Sign in");
    expect(() => validateHistoryTokenInput({ token: "../etc" })).toThrow("not a history link");
    expect(() => validateHistoryTokenInput({ token: "x".repeat(44) })).toThrow();
  });
});
