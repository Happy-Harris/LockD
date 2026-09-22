import { Pause, Play, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "@/domain/units";
import { useGym } from "@/lib/gym/store";
import { cn } from "@/lib/utils";

function remainingMs(endsAt: string) {
  return Date.parse(endsAt) - Date.now();
}

function chime(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.07;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 1174;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.05;
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.18);
    osc2.stop(ctx.currentTime + 0.34);
  } catch {
    /* ignore */
  }
}

function paintLockArt(seconds: number, label: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#0c0b0a";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#c24a32";
  ctx.fillRect(0, 0, 512, 18);
  ctx.fillStyle = "#f6f1e8";
  ctx.font = "700 42px Barlow Condensed, sans-serif";
  ctx.fillText("LOCK'D", 36, 90);
  ctx.font = "800 160px Barlow Condensed, sans-serif";
  ctx.fillText(formatDuration(seconds), 36, 280);
  ctx.fillStyle = "#b8b0a2";
  ctx.font = "500 28px Barlow, sans-serif";
  ctx.fillText(label.slice(0, 28) || "Rest", 36, 340);
  ctx.fillStyle = "#7e776c";
  ctx.font = "500 22px IBM Plex Mono, monospace";
  ctx.fillText("Keep the receipt.", 36, 460);
  return canvas.toDataURL("image/png");
}

export function RestTimerBar() {
  const restTimer = useGym((s) => s.restTimer);
  const workouts = useGym((s) => s.workouts);
  const sound = useGym((s) => s.settings.restTimerSound);
  const startRestTimer = useGym((s) => s.startRestTimer);
  const adjustRestTimer = useGym((s) => s.adjustRestTimer);
  const stopRestTimer = useGym((s) => s.stopRestTimer);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const chimed = useRef<string | null>(null);
  const title = useRef(typeof document === "undefined" ? "Lockd" : document.title);

  useEffect(() => {
    if (!restTimer?.isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [restTimer?.isRunning, restTimer?.endsAt]);

  const left = restTimer ? Date.parse(restTimer.endsAt) - now : 0;
  const progress = useMemo(() => {
    if (!restTimer) return 0;
    const total = restTimer.durationSeconds * 1000;
    return Math.min(1, Math.max(0, 1 - left / total));
  }, [left, restTimer]);

  useEffect(() => {
    if (!restTimer) return;
    if (left <= 0 && chimed.current !== restTimer.endsAt) {
      chimed.current = restTimer.endsAt;
      chime(sound);
    }
  }, [left, restTimer, sound]);

  useEffect(() => {
    if (!restTimer) {
      document.title = title.current;
      return;
    }
    const displaySeconds = left <= 0 ? 0 : Math.ceil(left / 1000);
    document.title = left <= 0 ? "Rest done · Lock'd" : `${formatDuration(displaySeconds)} rest · Lock'd`;
    return () => {
      document.title = title.current;
    };
  }, [left, restTimer]);

  useEffect(() => {
    if (!restTimer?.isRunning || typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    let sentinel: { release: () => Promise<void> } | null = null;
    void nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        sentinel = lock;
      })
      .catch(() => undefined);
    return () => {
      void sentinel?.release();
    };
  }, [restTimer?.isRunning, restTimer?.endsAt]);

  const stillActive = workouts.some((row) => row.status === "active" && row.id === restTimer?.workoutId);
  const done = Boolean(restTimer) && left <= 0;
  const display = done ? 0 : Math.ceil(Math.max(0, left) / 1000);

  useEffect(() => {
    if (!restTimer || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      const art = paintLockArt(display, restTimer.label ?? "Rest");
      navigator.mediaSession.metadata = new MediaMetadata({
        title: done ? "Rest complete" : `Rest ${formatDuration(display)}`,
        artist: restTimer.label ?? "Lock'd",
        album: "Lock'd",
        artwork: art ? [{ src: art, sizes: "512x512", type: "image/png" }] : [],
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        const remaining = Math.max(1, Math.ceil(remainingMs(restTimer.endsAt) / 1000));
        useGym.setState({ restTimer: { ...restTimer, isRunning: false, durationSeconds: remaining } });
      });
      navigator.mediaSession.setActionHandler("play", () => {
        startRestTimer(restTimer.durationSeconds, restTimer.workoutId, restTimer.setId, restTimer.label);
      });
      navigator.mediaSession.setActionHandler("seekforward", () => adjustRestTimer(15));
      navigator.mediaSession.setActionHandler("seekbackward", () => adjustRestTimer(-15));
      navigator.mediaSession.setActionHandler("stop", () => stopRestTimer());
    } catch {
      /* media session is best-effort */
    }
  }, [adjustRestTimer, display, done, restTimer, startRestTimer, stopRestTimer]);

  if (!restTimer || !stillActive) return null;

  const controls = (
    <>
      <button
        type="button"
        className="grid h-11 min-w-11 place-items-center rounded-xl px-1 text-xs font-medium text-muted hover:bg-surface hover:text-ink"
        onClick={() => adjustRestTimer(-15)}
        aria-label="Subtract 15 seconds"
      >
        −15
      </button>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
        onClick={() => adjustRestTimer(15)}
        aria-label="Add 15 seconds"
      >
        <Plus className="size-4" />
      </button>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
        onClick={() => {
          if (done) {
            stopRestTimer();
            return;
          }
          const remaining = Math.max(1, Math.ceil(remainingMs(restTimer.endsAt) / 1000));
          if (restTimer.isRunning) {
            useGym.setState({
              restTimer: { ...restTimer, isRunning: false, durationSeconds: remaining },
            });
          } else {
            startRestTimer(restTimer.durationSeconds, restTimer.workoutId, restTimer.setId, restTimer.label);
          }
        }}
        aria-label={restTimer.isRunning ? "Pause rest" : "Resume rest"}
      >
        {done ? null : restTimer.isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink"
        onClick={stopRestTimer}
        aria-label="Dismiss rest timer"
      >
        <X className="size-4" />
      </button>
    </>
  );

  return (
    <>
      {expanded ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-canvas/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[32px] bg-surface p-6 hairline">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
              {done ? "On the clock" : "Lock-screen rest"}
            </p>
            <p className="mt-3 font-display text-7xl font-semibold tracking-tight tabular">{formatDuration(display)}</p>
            <p className="mt-2 text-sm text-muted">{restTimer.label ?? "Between sets"}</p>
            <p className="mt-1 text-xs text-subtle">
              Screen stays awake. If the phone supports it, rest also shows on the lock screen via media controls.
            </p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className={cn("h-full", done ? "bg-success" : "bg-accent")}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-1">{controls}</div>
            <button type="button" className="mt-3 w-full py-3 text-sm text-muted" onClick={() => setExpanded(false)}>
              Collapse
            </button>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none fixed inset-x-0 bottom-[4.6rem] z-40 px-3 lg:bottom-6">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2 rounded-2xl bg-raised px-3 py-2.5 hairline">
          <button type="button" className="relative size-11 shrink-0" onClick={() => setExpanded(true)} aria-label="Expand rest">
            <svg viewBox="0 0 36 36" className="size-11 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${progress * 94.2} 94.2`}
                className={cn(done ? "text-success" : "text-accent")}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-[10px] font-semibold tabular text-ink">
              {formatDuration(display)}
            </span>
          </button>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(true)}>
            <p className="truncate text-sm font-medium text-ink">{done ? "Rest complete" : "Rest"}</p>
            <p className="truncate text-xs text-muted">{restTimer.label ?? "Between sets"}</p>
          </button>
          {controls}
        </div>
      </div>
    </>
  );
}
