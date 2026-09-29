import { describe, expect, it } from "vitest";
import { lowerFirst } from "./autopsy";

describe("autopsy headline wording (plan I-25)", () => {
  it("keeps 1RM and RPE in capitals inside a sentence", () => {
    expect(lowerFirst("Flat estimated 1RM")).toBe("flat estimated 1RM");
    expect(lowerFirst("Rising RPE")).toBe("rising RPE");
  });

  it("lowers only the first letter of every title the autopsy can produce", () => {
    for (const title of [
      "Missed reps",
      "Flat estimated 1RM",
      "Falling volume",
      "Rising RPE",
      "Inconsistent frequency",
      "High recent workload",
    ]) {
      const lowered = lowerFirst(title);
      expect(lowered.slice(1)).toBe(title.slice(1));
      expect(lowered.charAt(0)).toBe(title.charAt(0).toLowerCase());
    }
  });

  it("handles an empty title", () => {
    expect(lowerFirst("")).toBe("");
  });
});
