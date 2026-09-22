import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { publishShare } from "@/lib/cloud/api";
import { useCloud } from "@/lib/cloud/sync";
import type { ShareKind, SharePayload } from "@/lib/cloud/types";

export function PublishButton({
  kind,
  title,
  payload,
  label = "Share a link",
}: {
  kind: ShareKind;
  title: string;
  payload: SharePayload;
  label?: string;
}) {
  const { user, isPending } = useCurrentUserState();
  const { profile } = useCloud();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  if (isPending) return <div className="h-11 animate-pulse rounded-xl bg-raised" />;
  if (!user) {
    return (
      <Button className="w-full" variant="secondary" asChild>
        <Link to="/login">Sign in to share a link</Link>
      </Button>
    );
  }

  const share = async () => {
    setBusy(true);
    try {
      const athlete = profile?.displayName || user.displayName || "Lifter";
      const stamped: SharePayload = { ...payload, athlete, handle: profile?.handle };
      const result = await publishShare({ data: { kind, title, payload: stamped } });
      const href = `${window.location.origin}/s/${result.id}`;
      setUrl(href);
      await navigator.clipboard.writeText(href);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not publish that receipt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button className="w-full" variant="secondary" onClick={() => void share()} disabled={busy}>
        {busy ? "Stamping…" : url ? "Copy link again" : label}
      </Button>
      {url ? (
        <p className="break-all font-mono text-[11px] text-subtle">
          <Link to="/s/$id" params={{ id: url.split("/").pop() ?? "" }} className="underline-offset-2 hover:underline">
            {url}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
