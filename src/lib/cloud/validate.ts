import { z } from "zod";
import { PROGRAM_FORMAT } from "@/domain/types";
import type { CloudGym, ShareKind, SharePayload } from "./types";

/**
 * Input checks for the cloud server functions (plan I-37). They used to type-cast whatever arrived. Each one now
 * checks shape and size and throws a plain sentence, so a bad request fails before it reaches the database and the
 * handlers can rely on the types they declare.
 *
 * The size limits are engineering caps, not product rules, and are a decision for the owner: the vault cap is far above
 * any real history (a decade of daily training is a few tens of MB at most) so it can never block someone's record;
 * the share cap keeps a public page small.
 */
export const MAX_VAULT_BYTES = 64 * 1024 * 1024;
export const MAX_SHARE_BYTES = 256 * 1024;
export const MAX_TITLE_LENGTH = 200;
export const MAX_NAME_LENGTH = 200;
export const MAX_BIO_LENGTH = 2_000;
export const MAX_QUESTION_LENGTH = 2_000;

const row = z.record(z.string(), z.unknown());
const rows = z.array(row);

/**
 * The vault is checked for structure only: an object, the collections the server reads as arrays of objects, and
 * settings as an object. Field-by-field checking of every stored row is left to the backup schema on the client,
 * because a strict row check here could refuse a real history from an older app and stop it syncing.
 */
const vault = z.object({
  exercises: rows,
  workouts: rows,
  workoutExercises: rows,
  workoutSets: rows,
  settings: row,
  templates: rows.optional(),
  templateExercises: rows.optional(),
  measurements: rows.optional(),
  plates: rows.optional(),
  bars: rows.optional(),
  labLast: z.object({ askedAt: z.string(), text: z.string() }).nullable().optional(),
  programs: rows.optional(),
  programWeeks: rows.optional(),
  programSessions: rows.optional(),
  programExercises: rows.optional(),
  eraNames: rows.optional(),
  machineSetups: rows.optional(),
  lessons: rows.optional(),
  namedPrs: rows.optional(),
  clips: rows.optional(),
});

const optionalName = z.string().max(MAX_NAME_LENGTH).optional();

function fail(message: string): never {
  throw new Error(message);
}

export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.length ? ` (${issue.path.join(".")})` : "";
  return `${issue?.message ?? "Invalid input"}${path}`;
}

function parse<S extends z.ZodType>(schema: S, input: unknown, what: string): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) fail(`That ${what} is not valid: ${firstIssue(result.error)}.`);
  return result.data;
}

export function validatePullInput(input: unknown): { displayName?: string } | undefined {
  if (input === undefined || input === null) return undefined;
  return parse(z.object({ displayName: optionalName }), input, "request");
}

export function validatePushInput(input: unknown): { payload: CloudGym; displayName?: string } {
  const data = parse(z.object({ payload: vault, displayName: optionalName }), input, "vault");
  if (byteLength(data.payload) > MAX_VAULT_BYTES) {
    fail(
      `That vault is over the ${MAX_VAULT_BYTES / 1024 / 1024} MB sync limit. Your log on this device is untouched; export a backup and tell us.`,
    );
  }
  return data as unknown as { payload: CloudGym; displayName?: string };
}

export function validateProfileInput(input: unknown): {
  handle: string;
  displayName: string;
  bio: string;
  isPublic: boolean;
} {
  return parse(
    z.object({
      handle: z.string().max(MAX_NAME_LENGTH),
      displayName: z.string().max(MAX_NAME_LENGTH),
      bio: z.string().max(MAX_BIO_LENGTH),
      isPublic: z.boolean(),
    }),
    input,
    "profile",
  );
}

export function validateIdInput(input: unknown): { id: string } {
  return parse(z.object({ id: z.uuid() }), input, "id");
}

export function validateHandleInput(input: unknown): { handle: string } {
  return parse(z.object({ handle: z.string().min(1).max(MAX_NAME_LENGTH) }), input, "handle");
}

export function validateQuestionInput(input: unknown): { question?: string } {
  return parse(
    z.object({ question: z.string().max(MAX_QUESTION_LENGTH).optional() }),
    input,
    "question",
  );
}

const person = {
  athlete: z.string().max(MAX_NAME_LENGTH),
  handle: z.string().max(MAX_NAME_LENGTH).optional(),
};
const unit = z.enum(["kg", "lb"]);
const count = z.number().finite();

/** One share payload shape per kind. `kind` inside the payload must match the share's own kind. */
const payloads = {
  moment: z.object({
    kind: z.literal("moment"),
    ...person,
    unit,
    moment: z.object({ id: z.string(), title: z.string(), date: z.string() }).passthrough(),
  }),
  receipt: z.object({
    kind: z.literal("receipt"),
    ...person,
    workoutName: z.string(),
    date: z.string(),
    durationSec: count,
    hardSets: count,
    tonnageLabel: z.string(),
    lines: z
      .array(z.object({ name: z.string(), sets: z.string(), pr: z.boolean().optional() }))
      .max(500),
    prs: z.array(z.string()).max(500),
    eraName: z.string().optional(),
    notes: z.string().optional(),
  }),
  wrapped: z.object({ kind: z.literal("wrapped"), ...person, unit, receipt: row }),
  program: z.object({
    kind: z.literal("program"),
    ...person,
    file: z
      .object({
        format: z.literal(PROGRAM_FORMAT),
        program: row,
        weeks: z.array(row),
        sessions: z.array(row),
      })
      .passthrough(),
  }),
} as const;

export function validateShareInput(input: unknown): {
  kind: ShareKind;
  title: string;
  payload: SharePayload;
} {
  const head = parse(
    z.object({
      kind: z.enum(["moment", "receipt", "wrapped", "program"]),
      title: z.string().max(MAX_TITLE_LENGTH),
      payload: z.unknown(),
    }),
    input,
    "share",
  );
  const payload = parse(payloads[head.kind], head.payload, `${head.kind} share`);
  if (byteLength(payload) > MAX_SHARE_BYTES) {
    fail(`That share is over the ${MAX_SHARE_BYTES / 1024} KB limit for a public page.`);
  }
  return { kind: head.kind, title: head.title, payload: payload as unknown as SharePayload };
}
