import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listMyShares, saveProfile } from "@/lib/cloud/api";
import { useCloud } from "@/lib/cloud/sync";

export const Route = createFileRoute("/locker")({ component: LockerPage });

function LockerPage() {
  const { user, isPending } = useCurrentUserState();
  const { profile, status, setProfile } = useCloud();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [shares, setShares] = useState<Array<{ id: string; kind: string; title: string; createdAt: string }>>([]);

  useEffect(() => {
    if (!profile) return;
    setHandle(profile.handle);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setIsPublic(profile.isPublic);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    void listMyShares()
      .then(setShares)
      .catch(() => setShares([]));
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
    const result = await saveProfile({ data: { handle, displayName, bio, isPublic } });
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setHandle(result.profile.handle);
    setProfile(result.profile);
    setNote("Locker saved.");
  };

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Locker</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">The public face of the log.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Handle, name, and the stamps you already earned. Vault status: {status === "synced" ? "on the locker" : status}.
      </p>

      <div className="mt-6 space-y-3">
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
          <Input value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Powerbuilding. Keep the receipt." />
        </label>
        <button
          type="button"
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
        {handle ? (
          <Button className="w-full" variant="secondary" asChild>
            <Link to="/u/$handle" params={{ handle }}>
              View public locker
            </Link>
          </Button>
        ) : null}
      </div>

      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">Published receipts</h2>
      <div className="mt-3 space-y-2">
        {shares.length === 0 ? (
          <p className="text-sm text-muted">Share a moment, session, year, or program and it lands here.</p>
        ) : (
          shares.map((share) => (
            <Link key={share.id} to="/s/$id" params={{ id: share.id }}>
              <Card className="flex items-center justify-between">
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-subtle">{share.kind}</span>
                  <span className="block font-medium">{share.title}</span>
                </span>
                <span className="font-mono text-[11px] text-subtle">{share.createdAt.slice(0, 10)}</span>
              </Card>
            </Link>
          ))
        )}
      </div>
    </Page>
  );
}
