import { beforeEach, describe, expect, it } from "vitest";
import { exportProgramFile, installPack, PROGRAM_PACKS } from "@/lib/gym/programs";
import { computeRecords, sliceSessions } from "@/lib/gym/analytics";
import { useGym } from "@/lib/gym/store";
import { seedExercises } from "@/lib/gym/seed";
import { cloudGymFromState } from "./payload";
import { momentShare, programShare, receiptShare, wrappedShare } from "./shares";
import {
  MAX_SHARE_BYTES,
  validateHandleInput,
  validateIdInput,
  validateProfileInput,
  validatePullInput,
  validatePushInput,
  validateQuestionInput,
  validateShareInput,
} from "./validate";

/** Plan I-37: the server functions check what they are sent instead of type-casting it. */
beforeEach(() => useGym.getState().resetAll());

function demoVault() {
  useGym.getState().loadDemo();
  return JSON.parse(JSON.stringify(cloudGymFromState(useGym.getState())));
}

describe("vault push", () => {
  it("accepts a real vault, the demo log included, untouched", () => {
    const payload = demoVault();
    const out = validatePushInput({ payload, displayName: "Sam" });
    expect(out.payload.workouts).toHaveLength(payload.workouts.length);
    expect(out.payload.workoutSets[0]).toEqual(payload.workoutSets[0]);
  });

  it("accepts an older client's vault that lacks the newer collections", () => {
    const {
      clips: _c,
      namedPrs: _n,
      machineSetups: _m,
      lessons: _l,
      programs: _p,
      ...old
    } = demoVault();
    expect(() => validatePushInput({ payload: old })).not.toThrow();
  });

  it.each([
    ["nothing", undefined],
    ["a string", "vault"],
    ["a payload with no workouts", { payload: { exercises: [], settings: {} } }],
    ["workouts that are not objects", { payload: { ...demoVault(), workouts: [1, 2] } }],
    ["workouts that are not an array", { payload: { ...demoVault(), workouts: {} } }],
    ["settings that are not an object", { payload: { ...demoVault(), settings: "x" } }],
    ["a display name of the wrong type", { payload: demoVault(), displayName: 7 }],
    ["an absurd display name", { payload: demoVault(), displayName: "x".repeat(500) }],
  ])("refuses %s with a sentence, before the handler runs", (_name, input) => {
    expect(() => validatePushInput(input)).toThrow(/is not valid/);
  });

  it("refuses a vault over the size cap and says the log on the device is untouched", () => {
    const payload = demoVault();
    // 70 MB of one text field: a hostile or broken client, not a lifter.
    payload.workouts[0].notes = "x".repeat(70 * 1024 * 1024);
    expect(() => validatePushInput({ payload })).toThrow(/sync limit.*untouched/);
  });
});

describe("pull, profile, ids, handles, questions", () => {
  it("pull takes nothing or a short display name", () => {
    expect(validatePullInput(undefined)).toBeUndefined();
    expect(validatePullInput({ displayName: "Sam" })).toEqual({ displayName: "Sam" });
    expect(() => validatePullInput({ displayName: 3 })).toThrow();
  });

  it("profile needs a boolean isPublic (a missing one used to be caught only after the cast)", () => {
    const ok = { handle: "sam", displayName: "Sam", bio: "", isPublic: false };
    expect(validateProfileInput(ok)).toEqual(ok);
    expect(() => validateProfileInput({ ...ok, isPublic: "yes" })).toThrow();
    expect(() => validateProfileInput({ ...ok, bio: "x".repeat(5000) })).toThrow();
    expect(() => validateProfileInput({ handle: "sam" })).toThrow();
  });

  it("share ids must be uuids and handles non-empty strings", () => {
    expect(validateIdInput({ id: "0b7a3c1e-6f2d-4e58-9c0a-1d2e3f4a5b6c" })).toBeDefined();
    expect(() => validateIdInput({ id: "1; drop table lockd_shares" })).toThrow();
    expect(() => validateIdInput({})).toThrow();
    expect(validateHandleInput({ handle: "sam" })).toEqual({ handle: "sam" });
    expect(() => validateHandleInput({ handle: "" })).toThrow();
    expect(() => validateHandleInput({ handle: 5 })).toThrow();
  });

  it("a Lab question is optional text of bounded length", () => {
    expect(validateQuestionInput({})).toEqual({});
    expect(validateQuestionInput({ question: "why did bench stall?" })).toBeDefined();
    expect(() => validateQuestionInput({ question: "x".repeat(3000) })).toThrow();
  });
});

describe("publishing a share", () => {
  const library = seedExercises("2026-09-28T12:00:00.000Z");

  it("accepts each kind of share the app builds", () => {
    useGym.getState().loadDemo();
    const state = useGym.getState();
    const slices = sliceSessions(state.workouts, state.workoutExercises, state.workoutSets);
    const records = computeRecords(slices, "epley", true);
    const slice = slices[slices.length - 1]!;
    const moment = {
      id: "m1",
      kind: "pr",
      date: "2026-09-01",
      title: "Bench",
      kicker: "k",
      detail: "d",
    } as const;
    const program = exportProgramFile(
      installPack(PROGRAM_PACKS[0]!, "2026-09-28T12:00:00.000Z"),
      library,
    );
    const receipt = {
      year: 2026,
      sessions: 3,
      hardSets: 30,
      uniqueLifts: 4,
      longestLayoffDays: 5,
      firsts: [],
      eras: [],
      busiestMonth: "2026-03",
    };
    const shares = [
      { kind: "moment", title: "A moment", payload: momentShare(moment, "kg") },
      {
        kind: "receipt",
        title: "A session",
        payload: receiptShare(slice, records.slice(0, 2), "lb", 3600, 90_000),
      },
      { kind: "wrapped", title: "A year", payload: wrappedShare(receipt, "kg") },
      { kind: "program", title: "A block", payload: programShare(program) },
    ] as const;
    for (const share of shares) {
      const out = validateShareInput(JSON.parse(JSON.stringify(share)));
      expect(out.kind).toBe(share.kind);
    }
  });

  it("refuses a payload whose kind disagrees with the share's kind", () => {
    const share = {
      kind: "receipt",
      title: "x",
      payload: momentShare({ id: "m", title: "t", date: "d" } as never, "kg"),
    };
    expect(() => validateShareInput(share)).toThrow(/receipt share is not valid/);
  });

  it("refuses an unknown kind, a missing payload and an over-long title", () => {
    expect(() => validateShareInput({ kind: "vault", title: "x", payload: {} })).toThrow();
    expect(() => validateShareInput({ kind: "moment", title: "x" })).toThrow();
    expect(() =>
      validateShareInput({ kind: "moment", title: "x".repeat(300), payload: {} }),
    ).toThrow();
  });

  it("refuses a public share over the size cap", () => {
    const share = {
      kind: "receipt",
      title: "big",
      payload: {
        kind: "receipt",
        athlete: "Lifter",
        workoutName: "w",
        date: "2026-01-01",
        durationSec: 1,
        hardSets: 1,
        tonnageLabel: "1 kg",
        lines: [],
        prs: [],
        notes: "x".repeat(MAX_SHARE_BYTES + 1),
      },
    };
    expect(() => validateShareInput(share)).toThrow(/limit for a public page/);
  });

  it("refuses a program share that is not a Lock'd program file", () => {
    const share = {
      kind: "program",
      title: "p",
      payload: { kind: "program", athlete: "L", file: { format: "other" } },
    };
    expect(() => validateShareInput(share)).toThrow();
  });
});
