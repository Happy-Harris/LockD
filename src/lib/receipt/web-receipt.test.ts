import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLifetimeReceipt, readExport, receiptFromExport, RECEIPT_TOP_LIFTS } from "./web-receipt";

/** Opp 2: the web receipt reads an export on the device and never touches the lifter's own log. */
const STRONG_HEADER = "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps";
const strong = (rows: Array<[date: string, exercise: string, kg: number, reps: number]>) =>
  [STRONG_HEADER, ...rows.map(([date, exercise, kg, reps], i) => `${date} 10:00:00,Workout,${exercise},${i + 1},${kg},${reps}`)].join(
    "\n",
  );

describe("reading the file", () => {
  it("reads a Strong export and names where it came from", () => {
    const read = readExport(strong([["2024-01-02", "Bench Press (Barbell)", 80, 5]]));
    expect(read.ok && read.source.label).toBe("a Strong CSV");
  });

  it("reads a Hevy export without being told it is one", () => {
    const text = readFileSync("src/test/fixtures/hevy/hevy-synthetic-kg-km.csv", "utf8");
    const read = readExport(text);
    expect(read.ok && read.source.id).toBe("hevy-csv");
  });

  it("says plainly when it cannot find sessions, and where to go instead", () => {
    const read = readExport("name,colour\nbench,red");
    expect(read.ok).toBe(false);
    expect(!read.ok && read.errors.join(" ")).toMatch(/choose the columns/);
    expect(readExport("   ").ok).toBe(false);
  });

  it("uses the lifter's unit only when the header does not say", () => {
    const unitless = "Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2024-01-02 10:00:00,W,Bench Press (Barbell),1,100,5";
    const lb = receiptFromExport(unitless, "x.csv", "lb");
    const kg = receiptFromExport(unitless, "x.csv", "kg");
    expect(lb.ok && lb.receipt.topLifts[0]!.weightG).toBe(45_359);
    expect(kg.ok && kg.receipt.topLifts[0]!.weightG).toBe(100_000);
    const declared = receiptFromExport(strong([["2024-01-02", "Bench Press (Barbell)", 100, 5]]), "x.csv", "lb");
    expect(declared.ok && declared.receipt.topLifts[0]!.weightG).toBe(100_000);
  });
});

describe("the lifetime receipt", () => {
  const text = strong([
    ["2021-03-01", "Squat (Barbell)", 100, 5],
    ["2021-03-01", "Bench Press (Barbell)", 70, 5],
    ["2021-03-04", "Squat (Barbell)", 105, 5],
    ["2021-03-08", "Squat (Barbell)", 110, 3],
    ["2021-03-08", "Curl (Dumbbell)", 15, 10],
    // Nothing logged in 2022.
    ["2023-06-05", "Bench Press (Barbell)", 75, 5],
    ["2023-06-08", "Squat (Barbell)", 100, 5],
    ["2023-06-12", "Deadlift (Barbell)", 140, 3],
  ]);
  const result = receiptFromExport(text, "strong.csv");
  if (!result.ok) throw new Error(result.errors.join(" "));
  const { receipt } = result;

  it("counts what the file holds", () => {
    expect(receipt).toMatchObject({ firstDate: "2021-03-01", lastDate: "2023-06-12", sessions: 6, lifts: 4 });
    expect(receipt.hardSets).toBe(8);
  });

  it("lists every year from first to last, and an empty year stays in as zero sessions", () => {
    expect(receipt.years).toEqual([
      { year: 2021, sessions: 3 },
      { year: 2022, sessions: 0 },
      { year: 2023, sessions: 3 },
    ]);
    // 2021 and 2023 both hold three sessions: a tie names both, not the first it met.
    expect(receipt.busiestYears).toEqual({ years: [2021, 2023], sessions: 3 });
  });

  it("names the longest gap by its dates", () => {
    expect(receipt.longestGap).toEqual({ days: 819, from: "2021-03-08", to: "2023-06-05" });
  });

  it("takes eras and layoffs from the Chronicle, so the two never disagree", () => {
    expect(receipt.chronicle.layoffs).toBe(1);
    expect(receipt.chronicle.eras.map((era) => era.name)).toEqual(["2023 Return", "Foundation"]);
  });

  it("names the most-logged lifts, each with the set its estimate came from", () => {
    expect(receipt.topLifts.length).toBeLessThanOrEqual(RECEIPT_TOP_LIFTS);
    // Epley: 105 × 5 (122.5) beats 110 × 3 (121). A lift matched to the library takes its name there.
    expect(receipt.topLifts[0]).toMatchObject({ name: "Squat (Barbell)", sessions: 4, weightG: 105_000, reps: 5, date: "2021-03-04" });
    expect(receipt.topLifts[1]).toMatchObject({ name: "Bench Press", sessions: 2 });
    expect(receipt.formula).toBe("epley");
  });

  it("has nothing to say about an empty log", () => {
    expect(buildLifetimeReceipt([], { eras: [], events: [] } as never, "epley")).toBeUndefined();
  });
});
