import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LAB_DAILY_LIMIT, labDailyLimit, labGate } from "./policy";

describe("Lab model-call gate", () => {
  const base = { devUserId: "dev-user", limit: 10 };

  it("refuses the shared dev user (auth disabled): no anonymous model calls", () => {
    const gate = labGate({ ...base, userId: "dev-user", notesLast24h: 0 });
    expect(gate.ok).toBe(false);
  });

  it("allows a signed-in user under the daily cap", () => {
    expect(labGate({ ...base, userId: "u1", notesLast24h: 9 })).toEqual({ ok: true });
  });

  it("refuses once the daily cap is reached", () => {
    const gate = labGate({ ...base, userId: "u1", notesLast24h: 10 });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.error).toMatch(/10/);
  });

  it("parses the cap from configuration with a safe default", () => {
    expect(labDailyLimit(undefined)).toBe(DEFAULT_LAB_DAILY_LIMIT);
    expect(labDailyLimit("")).toBe(DEFAULT_LAB_DAILY_LIMIT);
    expect(labDailyLimit("abc")).toBe(DEFAULT_LAB_DAILY_LIMIT);
    expect(labDailyLimit("3")).toBe(3);
    expect(labDailyLimit("0")).toBe(0);
    expect(labDailyLimit("-4")).toBe(DEFAULT_LAB_DAILY_LIMIT);
  });
});

describe("Lab server functions", () => {
  const source = fs.readFileSync(path.join(__dirname, "ask.ts"), "utf8");

  it("exposes no model call without auth middleware", () => {
    const chains = source.split("createServerFn(").slice(1);
    expect(chains.length).toBeGreaterThan(0);
    for (const chain of chains) {
      const head = chain.slice(0, chain.indexOf(".handler("));
      expect(head).toContain(".middleware([authMiddleware])");
    }
  });

  it("no longer exports the unauthenticated guest brief endpoint", () => {
    expect(source).not.toMatch(/export const askTheLab\b/);
  });

  it("checks the gate before calling the model", () => {
    const handler = source.slice(source.indexOf("export const consultLab"));
    expect(handler.indexOf("labGate(")).toBeGreaterThan(-1);
    expect(handler.indexOf("labGate(")).toBeLessThan(handler.indexOf("completeNote("));
  });
});
