import { PaperShell } from "@/components/app/paper-shell";
import { LEGAL_DRAFT_BANNER, LEGAL_DRAFT_DATE, type LegalSection } from "@/lib/legal/content";

export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <PaperShell>
      <p role="note" className="mb-6 rounded-xl border border-dashed border-current/30 px-4 py-3 text-sm font-medium">
        {LEGAL_DRAFT_BANNER}
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-xs text-subtle">Draft of {LEGAL_DRAFT_DATE}</p>
      {sections.map((section) => (
        <section key={section.heading} className="mt-7">
          <h2 className="font-display text-xl font-semibold tracking-tight">{section.heading}</h2>
          {section.paragraphs.map((text) => (
            <p key={text} className="mt-2 text-sm leading-relaxed text-ink">
              {text}
            </p>
          ))}
        </section>
      ))}
    </PaperShell>
  );
}
