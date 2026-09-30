import { describe, expect, it } from "vitest";
import type { Chronicle, ChronicleEvent, TrainingEra } from "./chronicle";
import { CHRONICLE_SUMMARY_ERAS, summariseChronicle } from "./chronicle-summary";

const era = (n: number, sessions: number): TrainingEra => ({
  id: `era-${n}`,
  name: `Era ${n}`,
  autoName: `Era ${n}`,
  startDate: `20${10 + n}-01-01`,
  endDate: `20${10 + n}-06-30`,
  sessions,
  hardSets: sessions * 10,
  tone: "foundation",
});

const event = (kind: ChronicleEvent["kind"], n: number): ChronicleEvent => ({
  id: `${kind}-${n}`,
  kind,
  startDate: "2012-01-01",
  title: kind,
  detail: "",
});

describe("the Chronicle after an import", () => {
  it("says nothing when there is no era yet", () => {
    expect(summariseChronicle({ eras: [], events: [] })).toBeUndefined();
  });

  it("reads the span, sessions, layoffs and PR runs straight off the Chronicle", () => {
    const chronicle: Chronicle = {
      eras: [era(1, 30), era(2, 12)],
      events: [event("layoff", 1), event("comeback", 1), event("pr_run", 1), event("era", 1)],
    };
    expect(summariseChronicle(chronicle)).toEqual({
      eraCount: 2,
      sessions: 42,
      firstDate: "2011-01-01",
      lastDate: "2012-06-30",
      layoffs: 1,
      prRuns: 1,
      eras: [chronicle.eras[1], chronicle.eras[0]],
      earlier: 0,
    });
  });

  it("lists the newest eras first and counts the rest", () => {
    const eras = Array.from({ length: CHRONICLE_SUMMARY_ERAS + 2 }, (_, i) => era(i + 1, 5));
    const summary = summariseChronicle({ eras, events: [] })!;
    expect(summary.eras.map((e) => e.name)).toEqual(["Era 7", "Era 6", "Era 5", "Era 4", "Era 3"]);
    expect(summary.earlier).toBe(2);
  });
});
