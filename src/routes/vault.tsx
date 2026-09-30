import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatLocalDate } from "@/domain/time";
import { useGym } from "@/lib/gym/store";
import { deleteClipBlob, getClipBlob } from "@/lib/gym/vault";

export const Route = createFileRoute("/vault")({ component: VaultPage });

function VaultPage() {
  const clips = useGym((s) => s.clips);
  const detachClip = useGym((s) => s.detachClip);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const clip of clips) {
        const blob = await getClipBlob(clip.id);
        if (!blob || cancelled) continue;
        const url = URL.createObjectURL(blob);
        created.push(url);
        next[clip.id] = url;
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [clips]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof clips>();
    for (const clip of [...clips].reverse()) {
      const list = map.get(clip.exerciseId) ?? [];
      list.push(clip);
      map.set(clip.exerciseId, list);
    }
    return [...map.entries()];
  }, [clips]);

  const selected = compare.map((id) => clips.find((row) => row.id === id)).filter(Boolean);

  return (
    <Page>
      <p className="text-micro font-medium uppercase tracking-[0.18em] text-subtle">Set vault</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Local tape.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Clips live in this browser, not a server. Pick two of the same lift for a side-by-side.
      </p>

      {selected.length === 2 ? (
        <div className="mt-6 grid grid-cols-2 gap-2">
          {selected.map((clip) =>
            clip ? (
              <div key={clip.id}>
                {urls[clip.id] ? (
                  <video src={urls[clip.id]} controls className="aspect-[3/4] w-full rounded-2xl bg-raised object-cover" />
                ) : (
                  <div className="grid aspect-[3/4] place-items-center rounded-2xl bg-raised text-xs text-muted">Missing file</div>
                )}
                <p className="mt-2 text-xs text-muted">
                  {clip.exerciseName} · {formatLocalDate(clip.localDate)}
                </p>
              </div>
            ) : null,
          )}
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <p className="mt-10 text-sm text-muted">Attach a clip from a set in the logger. It stays on this device.</p>
      ) : null}

      <div className="mt-6 space-y-6">
        {grouped.map(([exerciseId, list]) => (
          <section key={exerciseId}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{list[0]?.exerciseName}</h2>
              <Link to="/library/$id" params={{ id: exerciseId }} className="text-sm text-muted">
                DNA
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {list.map((clip) => {
                const on = compare.includes(clip.id);
                return (
                  <Card key={clip.id} className="p-2">
                    {urls[clip.id] ? (
                      <video src={urls[clip.id]} controls className="aspect-video w-full rounded-xl bg-raised object-cover" />
                    ) : (
                      <div className="grid aspect-video place-items-center rounded-xl bg-raised text-xs text-muted">
                        File not in this browser
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted">{formatLocalDate(clip.localDate)}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant={on ? "primary" : "secondary"}
                        className="flex-1"
                        onClick={() =>
                          setCompare((current) =>
                            on ? current.filter((id) => id !== clip.id) : [...current.slice(-1), clip.id],
                          )
                        }
                      >
                        {on ? "Selected" : "Compare"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void deleteClipBlob(clip.id);
                          detachClip(clip.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
