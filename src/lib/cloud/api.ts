import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { uuid } from "@/domain/ids";
import { defaultSettings } from "@/lib/gym/store";
import { buildLockerCard } from "./card";
import { historyView, MAX_HISTORY_LINKS, newHistoryToken, type HistoryView } from "./history-link";
import { asJson, publicSharePayload, slugHandle, vaultHasLog } from "./payload";
import {
  validateHandleInput,
  validateHistoryLinkInput,
  validateHistoryRevokeInput,
  validateHistoryTokenInput,
  validateIdInput,
  validateProfileInput,
  validatePullInput,
  validatePushInput,
  validateShareInput,
} from "./validate";
import type { CloudGym, CloudProfile, LabHistoryNote, LockerCard, PublicShare, ShareKind, SharePayload } from "./types";

async function requireCloudOwner(userId: string): Promise<void> {
  const { DEV_USER_ID } = await import("@/lib/auth/verify.server");
  if (!userId || userId === DEV_USER_ID) throw new Error("Sign in to manage your cloud locker.");
}

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

async function uniqueHandle(sql: Awaited<ReturnType<typeof getSql>>, userId: string, seed: string): Promise<string> {
  const base = slugHandle(seed);
  for (let i = 0; i < 40; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    const rows = await sql<{
      user_id: string;
    }>`select user_id from lockd_profiles where handle = ${candidate}`;
    if (!rows[0] || rows[0].user_id === userId) return candidate;
  }
  return `${base}${uuid().slice(0, 4)}`;
}

async function ensureProfile(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  displayName: string,
): Promise<CloudProfile & { card: LockerCard | null }> {
  const existing = await sql<{
    handle: string;
    display_name: string;
    bio: string;
    lens: string | null;
    is_public: boolean;
    privacy_notice_pending: boolean;
    card: unknown;
  }>`select handle, display_name, bio, lens, is_public, privacy_notice_pending, card from lockd_profiles where user_id = ${userId}`;
  if (existing[0]) {
    return {
      handle: existing[0].handle,
      displayName: existing[0].display_name,
      bio: existing[0].bio,
      lens: existing[0].lens ?? undefined,
      isPublic: existing[0].is_public,
      privacyNoticePending: existing[0].privacy_notice_pending,
      card: existing[0].card ? asJson<LockerCard>(existing[0].card) : null,
    };
  }
  const handle = await uniqueHandle(sql, userId, displayName);
  await sql`
    insert into lockd_profiles (user_id, handle, display_name, bio, is_public)
    values (${userId}, ${handle}, ${displayName}, ${""}, ${false})
  `;
  return { handle, displayName, bio: "", isPublic: false, privacyNoticePending: false, card: null };
}

async function refreshCard(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  payload: CloudGym,
  profile: CloudProfile,
): Promise<LockerCard> {
  const card = buildLockerCard(payload, {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
  });
  await sql`
    update lockd_profiles
    set card = ${jsonText(card)}::jsonb, lens = ${payload.settings.goalLens ?? null}, updated_at = now()
    where user_id = ${userId}
  `;
  return card;
}

export const pullVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validatePullInput)
  .handler(async ({ context, data }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const name = data?.displayName?.trim() || "Lifter";
    const profile = await ensureProfile(sql, context.userId, name);
    const rows = await sql<{ payload: unknown; revision: number; updated_at: string }>`
      select payload, revision, updated_at from lockd_vaults where user_id = ${context.userId}
    `;
    if (!rows[0]) {
      return {
        payload: null as CloudGym | null,
        revision: 0,
        profile,
        updatedAt: null as string | null,
      };
    }
    return {
      payload: asJson<CloudGym>(rows[0].payload),
      revision: rows[0].revision,
      profile,
      updatedAt: rows[0].updated_at,
    };
  });

export const pushVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validatePushInput)
  .handler(async ({ context, data }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const name = data.displayName?.trim() || "Lifter";
    const profile = await ensureProfile(sql, context.userId, name);
    const settings = { ...defaultSettings(), ...data.payload.settings };
    const payload: CloudGym = { ...data.payload, settings };
    await sql.query(
      `insert into lockd_vaults (user_id, payload, revision, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (user_id) do update
       set payload = excluded.payload, revision = lockd_vaults.revision + 1, updated_at = now()`,
      [context.userId, jsonText(payload)],
    );
    const card = vaultHasLog(payload) ? await refreshCard(sql, context.userId, payload, profile) : profile.card;
    const rev = await sql<{ revision: number; updated_at: string }>`
      select revision, updated_at from lockd_vaults where user_id = ${context.userId}
    `;
    return {
      ok: true as const,
      revision: rev[0]?.revision ?? 1,
      updatedAt: rev[0]?.updated_at ?? new Date().toISOString(),
      card,
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validateProfileInput)
  .handler(async ({ context, data }) => {
    await requireCloudOwner(context.userId);
    if (typeof data.isPublic !== "boolean") throw new Error("Choose whether your locker is public.");
    const handle = slugHandle(data.handle);
    if (handle.length < 3) return { ok: false as const, error: "Handle needs at least 3 letters." };
    const sql = await getSql();
    const clash = await sql<{
      user_id: string;
    }>`select user_id from lockd_profiles where handle = ${handle}`;
    if (clash[0] && clash[0].user_id !== context.userId) {
      return { ok: false as const, error: "That handle is taken." };
    }
    const displayName = data.displayName.trim().slice(0, 40) || "Lifter";
    const bio = data.bio.trim().slice(0, 180);
    await sql`
      insert into lockd_profiles (user_id, handle, display_name, bio, is_public, updated_at)
      values (${context.userId}, ${handle}, ${displayName}, ${bio}, ${data.isPublic}, now())
      on conflict (user_id) do update set
        handle = excluded.handle,
        display_name = excluded.display_name,
        bio = excluded.bio,
        is_public = excluded.is_public,
        -- Publishing on purpose answers the "your locker is now private" notice.
        privacy_notice_pending = lockd_profiles.privacy_notice_pending and not excluded.is_public,
        updated_at = now()
    `;
    const vault = await sql<{
      payload: unknown;
    }>`select payload from lockd_vaults where user_id = ${context.userId}`;
    let card: LockerCard | null = null;
    if (vault[0]) {
      card = await refreshCard(sql, context.userId, asJson<CloudGym>(vault[0].payload), {
        handle,
        displayName,
        bio,
        isPublic: data.isPublic,
      });
    }
    return {
      ok: true as const,
      profile: await ensureProfile(sql, context.userId, displayName),
      card,
    };
  });

export const acknowledgePrivacyNotice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    await sql`update lockd_profiles set privacy_notice_pending = false where user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const unpublishShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validateIdInput)
  .handler(async ({ context, data }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const removed = await sql<{ id: string }>`delete from lockd_shares
      where id = ${data.id} and user_id = ${context.userId} returning id`;
    return { ok: removed.length > 0 };
  });

export const getLocker = createServerFn({ method: "GET" })
  .validator(validateHandleInput)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{
      handle: string;
      display_name: string;
      bio: string;
      is_public: boolean;
      card: unknown;
      user_id: string;
    }>`select handle, display_name, bio, is_public, card, user_id from lockd_profiles where handle = ${data.handle.toLowerCase()}`;
    const row = rows[0];
    if (!row || !row.is_public) return { ok: false as const, error: "No public locker under that name." };
    let card = row.card ? asJson<LockerCard>(row.card) : null;
    if (!card) {
      const vault = await sql<{
        payload: unknown;
      }>`select payload from lockd_vaults where user_id = ${row.user_id}`;
      if (vault[0]) {
        card = buildLockerCard(asJson<CloudGym>(vault[0].payload), {
          handle: row.handle,
          displayName: row.display_name,
          bio: row.bio,
        });
      }
    }
    if (!card) {
      card = {
        handle: row.handle,
        displayName: row.display_name,
        bio: row.bio,
        streak: 0,
        sessions: 0,
        relative: [],
        moments: [],
      };
    }
    return { ok: true as const, card };
  });

export const publishShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validateShareInput)
  .handler(async ({ context, data }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const id = uuid();
    await sql.query(`insert into lockd_shares (id, user_id, kind, title, payload) values ($1, $2, $3, $4, $5::jsonb)`, [
      id,
      context.userId,
      data.kind,
      data.title.slice(0, 80),
      jsonText(data.payload),
    ]);
    return { ok: true as const, id };
  });

export const getShare = createServerFn({ method: "GET" })
  .validator(validateIdInput)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: ShareKind;
      title: string;
      payload: unknown;
      created_at: string;
    }>`select id, kind, title, payload, created_at from lockd_shares where id = ${data.id}`;
    if (!rows[0]) return { ok: false as const, error: "That receipt is not on the locker." };
    const share: PublicShare = {
      id: rows[0].id,
      kind: rows[0].kind,
      title: rows[0].title,
      createdAt: rows[0].created_at,
      payload: publicSharePayload(asJson<SharePayload>(rows[0].payload)),
    };
    return { ok: true as const, share };
  });

export const listMyShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; kind: ShareKind; title: string; created_at: string }>`
      select id, kind, title, created_at from lockd_shares
      where user_id = ${context.userId}
      order by created_at desc
      limit 24
    `;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      createdAt: row.created_at,
    }));
  });

export const listLabNotes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; question: string; answer: string; created_at: string }>`
      select id, question, answer, created_at from lockd_lab_notes
      where user_id = ${context.userId}
      order by created_at desc
      limit 8
    `;
    const notes: LabHistoryNote[] = rows.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      createdAt: row.created_at,
    }));
    return notes;
  });

/** Drivers differ on timestamptz (a Date or text); links always carry ISO text. */
function isoTime(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export type HistoryLinkRow = { token: string; label: string; createdAt: string };

/** Opp 9: a new read-only history link. The token is the whole secret; the owner can revoke it at any time. */
export const createHistoryLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validateHistoryLinkInput)
  .handler(async ({ context, data }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const count = await sql<{ n: number }>`
      select count(*)::int as n from lockd_history_links where user_id = ${context.userId}
    `;
    if ((count[0]?.n ?? 0) >= MAX_HISTORY_LINKS) {
      return {
        ok: false as const,
        error: `You already have ${MAX_HISTORY_LINKS} read-only links. Revoke one to make another.`,
      };
    }
    const token = newHistoryToken();
    const rows = await sql<{ created_at: string }>`
      insert into lockd_history_links (id, user_id, label) values (${token}, ${context.userId}, ${data.label})
      returning created_at
    `;
    const link: HistoryLinkRow = { token, label: data.label, createdAt: isoTime(rows[0]?.created_at) };
    return { ok: true as const, link };
  });

export const listHistoryLinks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; label: string; created_at: string }>`
      select id, label, created_at from lockd_history_links
      where user_id = ${context.userId}
      order by created_at desc
    `;
    return rows.map((row): HistoryLinkRow => ({ token: row.id, label: row.label, createdAt: isoTime(row.created_at) }));
  });

export const revokeHistoryLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validateHistoryRevokeInput)
  .handler(async ({ context, data }) => {
    await requireCloudOwner(context.userId);
    const sql = await getSql();
    const removed = await sql<{ id: string }>`delete from lockd_history_links
      where id = ${data.token} and user_id = ${context.userId} returning id`;
    return { ok: removed.length > 0 };
  });

/**
 * The public read of a history link. An unknown or revoked token and a link whose owner has no synced log get the
 * same answer, so the page confirms nothing about who is behind a token.
 */
export const getHistoryView = createServerFn({ method: "GET" })
  .validator(validateHistoryTokenInput)
  .handler(async ({ data }) => {
    const missing = { ok: false as const, error: "This link doesn’t open a training log. It may have been revoked." };
    const sql = await getSql();
    const links = await sql<{ user_id: string }>`select user_id from lockd_history_links where id = ${data.token}`;
    if (!links[0]) return missing;
    const vault = await sql<{ payload: unknown }>`select payload from lockd_vaults where user_id = ${links[0].user_id}`;
    if (!vault[0]) return missing;
    const view: HistoryView = historyView(asJson<CloudGym>(vault[0].payload), data.offset);
    return { ok: true as const, view };
  });
