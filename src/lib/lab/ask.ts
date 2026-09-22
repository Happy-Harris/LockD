import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { uuid } from "@/domain/ids";
import { asJson } from "@/lib/cloud/payload";
import type { CloudGym, LabHistoryNote } from "@/lib/cloud/types";
import { buildLabBrief } from "./brief";

const SYSTEM = `You are the Lab inside Lock’d, a training operating system that remembers a lifting life. Voice: dry, specific, no cheerleading, no slang, no emoji, no exclamation marks. Never invent numbers, dates, or sessions that are not in the brief. Cite exact lifts, dates, and set evidence from the brief when you make a claim. Separate (a) what this log shows from (b) general training practice. 140–200 words. Structure: (1) what last week actually did versus baseline, with citations, (2) one stall or easier-week risk if present, citing autopsy evidence, (3) one concrete next-session suggestion using DNA personality, milestone queue, and progression whys. If the lifter asked a question, answer it using the log first. Keep the receipt.`;

async function completeNote(brief: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "The Lab is unavailable in this environment." };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: 520,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: brief },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: `Lab error ${res.status}` };
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) return { ok: false, error: "The Lab returned an empty note." };
  return { ok: true, text };
}

export const askTheLab = createServerFn({ method: "POST" })
  .validator((input: { brief: string }) => input)
  .handler(async ({ data }) => completeNote(data.brief.slice(0, 4000)));

export const consultLab = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { question?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const vault = await sql<{ payload: unknown }>`select payload from lockd_vaults where user_id = ${context.userId}`;
    if (!vault[0]) return { ok: false as const, error: "Sign in and sync a log before asking the Lab." };
    const payload = asJson<CloudGym>(vault[0].payload);
    const priorRows = await sql<{ id: string; question: string; answer: string; created_at: string }>`
      select id, question, answer, created_at from lockd_lab_notes
      where user_id = ${context.userId}
      order by created_at desc
      limit 4
    `;
    const prior: LabHistoryNote[] = priorRows.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      createdAt: row.created_at,
    }));
    const brief = buildLabBrief(payload, data.question, prior);
    const result = await completeNote(brief);
    if (!result.ok) return result;
    const id = uuid();
    const question = data.question?.trim() ?? "";
    await sql`
      insert into lockd_lab_notes (id, user_id, question, answer)
      values (${id}, ${context.userId}, ${question}, ${result.text})
    `;
    return { ok: true as const, text: result.text, id, askedAt: new Date().toISOString() };
  });
