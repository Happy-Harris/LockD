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
import { publicSharePayload } from "./payload";
import { receiptShare } from "./shares";
import { validateShareInput } from "./validate";
import type { SessionSlice } from "@/lib/gym/analytics";

/** A receipt as clients published it before gap 2: the workout's private notes rode along. */
const oldReceipt = {
  kind: "receipt",
  athlete: "Lifter",
  workoutName: "Push",
  date: "2026-09-01",
  durationSec: 3600,
  hardSets: 12,
  tonnageLabel: "5,000 kg",
  lines: [{ name: "Bench Press", sets: "100 kg × 5" }],
  prs: [],
  notes: "left shoulder twinge, see physio",
};

const db = new PGlite();
beforeAll(async () => {
  await db.exec(readFileSync("migrations/0002_lockd_cloud.sql", "utf8"));
  await db.query(`insert into lockd_shares (id, user_id, kind, title, payload) values
    ('11111111-1111-4111-8111-111111111111', 'athlete-a', 'receipt', 'Push', $1::jsonb),
    ('22222222-2222-4222-8222-222222222222', 'athlete-a', 'program', 'Plan', $2::jsonb)`, [
    JSON.stringify(oldReceipt),
    JSON.stringify({ kind: "program", athlete: "Lifter", file: { program: { notes: "shown on the page" } } }),
  ]);
  const query = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
  state.sql = Object.assign(
    (parts: TemplateStringsArray, ...params: unknown[]) =>
      query(parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""), params),
    { query },
  );
});
afterAll(() => db.close());

describe("workout notes never reach a public receipt", () => {
  it("a new receipt share leaves the notes out", () => {
    const slice = {
      workout: { name: "Push", localDate: "2026-09-01", notes: "private" },
      exercises: [],
      sets: [],
    } as unknown as SessionSlice;
    expect(receiptShare(slice, [], "kg", 60, 0)).not.toHaveProperty("notes");
  });

  it("an old client's notes are dropped by the publish validator", () => {
    const parsed = validateShareInput({ kind: "receipt", title: "Push", payload: oldReceipt });
    expect(parsed.payload).not.toHaveProperty("notes");
    expect(parsed.payload).toMatchObject({ workoutName: "Push", hardSets: 12 });
  });

  it("a stored receipt from before the fix is read without its notes", async () => {
    const read = await api.getShare({ data: { id: "11111111-1111-4111-8111-111111111111" } });
    expect(read.ok && read.share.payload).not.toHaveProperty("notes");
    expect(read.ok && read.share.payload).toMatchObject({ workoutName: "Push", lines: oldReceipt.lines });
  });

  it("migration 0005 removes the notes from stored receipts and touches nothing else", async () => {
    await db.exec(readFileSync("migrations/0005_share_receipt_notes.sql", "utf8"));
    const rows = (await db.query<{ kind: string; payload: Record<string, unknown> }>(
      `select kind, payload from lockd_shares order by id`,
    )).rows;
    const { notes: _notes, ...rest } = oldReceipt;
    expect(rows[0].payload).toEqual(rest);
    expect(rows[1].payload).toMatchObject({ file: { program: { notes: "shown on the page" } } });
    // Running it again changes nothing.
    await db.exec(readFileSync("migrations/0005_share_receipt_notes.sql", "utf8"));
    expect((await db.query(`select payload from lockd_shares order by id`)).rows[0]).toEqual({ payload: rest });
  });

  it("publicSharePayload leaves other kinds alone", () => {
    const program = { kind: "program", athlete: "Lifter", file: {} } as never;
    expect(publicSharePayload(program)).toBe(program);
  });
});
