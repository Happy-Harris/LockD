import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  acknowledgePrivacyNotice,
  createHistoryLink,
  listHistoryLinks,
  listMyShares,
  revokeHistoryLink,
  saveProfile,
  unpublishShare,
  type HistoryLinkRow,
} from "@/lib/cloud/api";
import { MAX_LINK_LABEL_LENGTH } from "@/lib/cloud/history-link";
import { useCloud } from "@/lib/cloud/sync";

export const Route = createFileRoute("/locker")({ component: LockerPage });

export function LockerPage() {
  const { user, isPending } = useCurrentUserState();
  const { profile, status, setProfile } = useCloud();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [shares, setShares] = useState<Array<{ id: string; kind: string; title: string; createdAt: string }>>([]);

  useEffect(() => {
    if (!profile) return;
    setHandle(profile.handle);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setIsPublic(profile.isPublic);
  }, [profile]);

  const [links, setLinks] = useState<HistoryLinkRow[]>([]);
  const [linkLabel, setLinkLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void listMyShares()
      .then(setShares)
      .catch(() => setShares([]));
    void listHistoryLinks()
      .then(setLinks)
      .catch(() => setLinks([]));
  }, [user]);

  if (isPending) {
    return (
      <Page>
        <div className="h-40 animate-pulse rounded-2xl bg-raised" />
      </Page>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const save = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const result = await saveProfile({ data: { handle, displayName, bio, isPublic } });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setHandle(result.profile.handle);
      setProfile(result.profile);
      setNote("Locker saved.");
    } catch {
      setNote("Could not save your locker. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const dismissNotice = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      await acknowledgePrivacyNotice();
      setProfile({ ...profile, privacyNoticePending: false });
    } catch {
      setNote("Could not dismiss the notice. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (id: string) => {
    setBusy(true);
    try {
      const result = await unpublishShare({ data: { id } });
      if (!result.ok) {
        setNote("Could not unpublish that receipt.");
        return;
      }
      setShares((current) => current.filter((share) => share.id !== id));
      setNote("Receipt unpublished. Its public link no longer works.");
    } catch {
      setNote("Could not unpublish that receipt. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const linkUrl = (token: string) =>
    `${typeof window === "undefined" ? "" : window.location.origin}/h/${token}`;

  const createLink = async () => {
    setBusy(true);
    try {
      const result = await createHistoryLink({ data: { label: linkLabel } });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setLinks((current) => [result.link, ...current]);
      setLinkLabel("");
      setNote("Read-only link made. Copy it and send it to the person you trust with your log.");
    } catch {
      setNote("Could not make a link. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      setCopied(token);
    } catch {
      setNote(`Copy this link: ${linkUrl(token)}`);
    }
  };

  const revokeLink = async (token: string) => {
    setBusy(true);
    try {
      const result = await revokeHistoryLink({ data: { token } });
      if (!result.ok) {
        setNote("Could not revoke that link.");
        return;
      }
      setLinks((current) => current.filter((link) => link.token !== token));
      setNote("Link revoked. It no longer opens your log.");
    } catch {
      setNote("Could not revoke that link. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">Locker</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Your locker. Your choice.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Handle, name, and the stamps you already earned. Vault status: {status === "synced" ? "on the locker" : status}.
      </p>

      {profile?.privacyNoticePending ? (
        <Card className="mt-6 space-y-3">
          <p className="text-sm">
            Your previously public locker is now private. Turn on Public locker and save only if you want to publish it
            again. Published receipts stay public until you unpublish them below.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void dismissNotice()}>
            Got it
          </Button>
        </Card>
      ) : null}
      <p className="mt-3 text-sm text-muted">
        Your profile stays private until you turn on Public locker and save. Published receipts have separate public
        links.
      </p>
      {!profile ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {status === "error" ? "Could not load your locker. Reconnect and try again." : "Loading your locker…"}
        </p>
      ) : null}
      <fieldset disabled={!profile || busy} className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-subtle">Handle</span>
          <Input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="ironblock" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-subtle">Name on receipts</span>
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-subtle">Bio</span>
          <Input
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Powerbuilding. Keep the receipt."
          />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setIsPublic((value) => !value)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl bg-raised px-4 text-sm hairline"
        >
          <span>Public locker</span>
          <span className="text-muted">{isPublic ? "On" : "Off"}</span>
        </button>
        <Button className="w-full" onClick={() => void save()}>
          Save locker
        </Button>
        {note ? <p className="text-sm text-muted">{note}</p> : null}
        {profile?.isPublic && handle ? (
          <Button className="w-full" variant="secondary" asChild>
            <Link to="/u/$handle" params={{ handle }}>
              View public locker
            </Link>
          </Button>
        ) : null}
      </fieldset>

      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">Published receipts</h2>
      <div className="mt-3 space-y-2">
        {shares.length === 0 ? (
          <p className="text-sm text-muted">Share a moment, session, year, or program and it lands here.</p>
        ) : (
          shares.map((share) => (
            <div key={share.id} className="space-y-2">
              <Link to="/s/$id" params={{ id: share.id }}>
                <Card className="flex items-center justify-between">
                  <span>
                    <span className="block text-micro-legacy uppercase tracking-[0.16em] text-subtle">{share.kind}</span>
                    <span className="block font-medium">{share.title}</span>
                  </span>
                  <span className="font-mono text-micro text-subtle">{share.createdAt.slice(0, 10)}</span>
                </Card>
              </Link>
              <Button variant="secondary" disabled={busy} onClick={() => void unpublish(share.id)}>
                Unpublish {share.title}
              </Button>
            </div>
          ))
        )}
      </div>

      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">Read-only links</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        For a coach or training partner: a private link to your synced sessions and sets, kept current. It does not show
        your locker, name, notes, bodyweight or videos. Anyone holding the link can read it until you revoke it.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          aria-label="Who is this link for?"
          value={linkLabel}
          maxLength={MAX_LINK_LABEL_LENGTH}
          onChange={(event) => setLinkLabel(event.target.value)}
          placeholder="Who is it for? (only you see this)"
        />
        <Button disabled={busy} onClick={() => void createLink()} data-testid="history-link-create">
          Make link
        </Button>
      </div>
      <div className="mt-3 space-y-2" data-testid="history-links">
        {links.length === 0 ? (
          <p className="text-sm text-muted">No read-only links. Nobody can see your log.</p>
        ) : (
          links.map((link) => (
            <Card key={link.token} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{link.label || "Read-only link"}</span>
                <span className="font-mono text-micro text-subtle">{link.createdAt.slice(0, 10)}</span>
              </div>
              <p className="break-all font-mono text-xs text-muted">{linkUrl(link.token)}</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void copyLink(link.token)}>
                  {copied === link.token ? "Copied" : "Copy link"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void revokeLink(link.token)}>
                  Revoke {link.label || "link"}
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </Page>
  );
}
