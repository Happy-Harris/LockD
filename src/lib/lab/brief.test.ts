import { describe, expect, it } from "vitest";
import { formatSetLine } from "./brief";

describe("the Lab brief", () => {
  it("writes set loads in the lifter's own unit", () => {
    const set = { setType: "working", weightG: 102_058, reps: 5, isCompleted: true };
    expect(formatSetLine(set, "kg")).toBe("102.06 kg x 5r");
    expect(formatSetLine(set, "lb")).toMatch(/^225(\.\d+)? lb x 5r$/);
  });

  it("leaves out warm-ups and sets not completed", () => {
    expect(formatSetLine({ setType: "warmup", weightG: 60_000, reps: 5, isCompleted: true }, "kg")).toBeNull();
    expect(formatSetLine({ setType: "working", weightG: 60_000, reps: 5, isCompleted: false }, "kg")).toBeNull();
  });
});
