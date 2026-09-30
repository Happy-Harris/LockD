import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSlices } from "@/lib/gym/hooks";
import { searchSessions } from "@/lib/gym/search";
import { useGym } from "@/lib/gym/store";
import { weightUnitFor } from "@/domain/units";
import { cn } from "@/lib/utils";
import { setTextSize, TEXT_SIZE_LABEL, TEXT_SIZES } from "@/lib/device/text-size";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  /** Other words that find this item, not shown. */
  keywords?: string;
  run: () => void;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const unit = useGym((s) => weightUnitFor(s.settings.unitSystem));
  const templates = useGym((s) => s.templates);
  const startFromTemplate = useGym((s) => s.startFromTemplate);
  const startEmptyWorkout = useGym((s) => s.startEmptyWorkout);
  const repeatLastWorkout = useGym((s) => s.repeatLastWorkout);
  const slices = useSlices();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const go = (to: string) => () => {
      void navigate({ to });
      setOpen(false);
    };
    const list: CommandItem[] = [
      {
        id: "empty",
        label: "Start empty session",
        hint: "Logger",
        run: () => {
          startEmptyWorkout();
          void navigate({ to: "/workout" });
          setOpen(false);
        },
      },
      {
        id: "repeat",
        label: "Repeat last session",
        hint: "Logger",
        run: () => {
          const id = repeatLastWorkout();
          if (id) void navigate({ to: "/workout" });
          setOpen(false);
        },
      },
      { id: "today", label: "Today", run: go("/") },
      { id: "history", label: "History", run: go("/history") },
      { id: "chronicle", label: "Chronicle", run: go("/chronicle") },
      { id: "programs", label: "Programs", run: go("/programs") },
      { id: "locker", label: "Locker", run: go("/locker") },
      { id: "login", label: "Sign in", run: go("/login") },
      { id: "wrapped", label: "Yearly receipt", run: go("/wrapped") },
      { id: "data", label: "Data lab", run: go("/analytics") },
      { id: "lab", label: "Ask the Lab", run: go("/lab") },
      { id: "library", label: "Library", run: go("/library") },
      { id: "vault", label: "Set vault", run: go("/vault") },
      { id: "body", label: "Body", run: go("/body") },
      { id: "plates", label: "Plate calculator", run: go("/tools/plates") },
      { id: "warmup", label: "Warm-up generator", run: go("/tools/warmup") },
      {
        id: "lift-math",
        label: "Lift Math",
        keywords: "1rm one rep max e1rm estimated max percent percentage rir rpe calculator",
        run: go("/tools/lift-math"),
      },
      { id: "settings", label: "Settings", run: go("/settings") },
      ...TEXT_SIZES.map((size) => ({
        id: `text-${size}`,
        label: `Text size: ${TEXT_SIZE_LABEL[size]}`,
        hint: "This device",
        keywords: "font bigger smaller larger read appearance",
        run: () => {
          setTextSize(size);
          setOpen(false);
        },
      })),
    ];
    for (const template of templates.filter((row) => !row.isArchived)) {
      list.push({
        id: `t-${template.id}`,
        label: `Start ${template.name}`,
        hint: "Routine",
        run: () => {
          startFromTemplate(template.id);
          void navigate({ to: "/workout" });
          setOpen(false);
        },
      });
    }
    const q = query.trim().toLowerCase();
    const jumps = q
      ? list.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.hint?.toLowerCase().includes(q) ||
            item.keywords?.includes(q),
        )
      : list;
    const hits = q.length >= 2 ? searchSessions(query, slices, unit) : [];
    const sessionItems: CommandItem[] = hits.map((hit) => ({
      id: `s-${hit.workoutId}`,
      label: `${hit.name} · ${hit.date}`,
      hint: hit.why,
      run: () => {
        void navigate({ to: "/history/$id", params: { id: hit.workoutId } });
        setOpen(false);
      },
    }));
    return [...sessionItems, ...jumps];
  }, [templates, query, navigate, startEmptyWorkout, startFromTemplate, repeatLastWorkout, slices, unit]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-canvas/70 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface hairline"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="bench above 90, leg days under 45 min, jump…"
          className="h-14 w-full bg-transparent px-4 text-base text-ink outline-none placeholder:text-subtle"
        />
        <ul className="max-h-80 overflow-auto border-t border-line pb-2">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted">Nothing matches.</li>
          ) : (
            items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={item.run}
                  className={cn("flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm hover:bg-raised")}
                >
                  <span>{item.label}</span>
                  {item.hint ? <span className="shrink-0 text-xs text-subtle">{item.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-line px-4 py-2 text-micro text-subtle">Esc to close · local search, no model</p>
      </div>
    </div>
  );
}
