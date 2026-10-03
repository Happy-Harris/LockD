import { describe, expect, it } from "vitest";
import { HISTORY_PROMISE } from "@/lib/promise";
import { LEGAL_DRAFT_BANNER, PRIVACY_SECTIONS, TERMS_SECTIONS } from "./content";

const text = (sections: typeof PRIVACY_SECTIONS) => sections.flatMap((s) => [s.heading, ...s.paragraphs]).join("\n");

describe("legal drafts", () => {
  it("say they are drafts for the owner and a lawyer", () => {
    expect(LEGAL_DRAFT_BANNER).toMatch(/^DRAFT FOR OWNER AND LAWYER REVIEW/);
  });

  it("carry the history promise word for word", () => {
    expect(text(TERMS_SECTIONS)).toContain(HISTORY_PROMISE);
  });

  it("make no promise the code does not keep", () => {
    const privacy = text(PRIVACY_SECTIONS);
    // Account deletion is not built: the policy must not say it is in the app.
    expect(privacy).toMatch(/cannot be done in the app yet/);
    // Session receipts no longer carry notes (gap 2); clips and Health readings stay on the device.
    expect(privacy).toMatch(/never includes your workout notes/);
    expect(privacy).toMatch(/Video clips are stored separately on the device and are never uploaded/);
    expect(privacy).toMatch(/Apple Health or Health Connect stay on the device/);
  });

  it("name no price, plan or subscription (none is decided)", () => {
    expect(text(PRIVACY_SECTIONS) + text(TERMS_SECTIONS)).not.toMatch(/\$|£|€|per month|subscription|premium|trial/i);
  });
});
