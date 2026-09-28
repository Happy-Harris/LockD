import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BACKUP_FORMAT, type AccentTheme, type AppSettings, type LockdBackup, type ThemeMode, type UnitSystem, type WeekStartDay } from "@/domain/types";
import { defaultQuickIncrementG } from "@/domain/units";
import { useGym } from "@/lib/gym/store";
import { HISTORY_PROMISE, HISTORY_PROMISE_TITLE } from "@/lib/promise";
import { SafetyBackups } from "@/components/app/safety-backups";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useGym((s) => s.settings);
  const updateSettings = useGym((s) => s.updateSettings);
  const exportBackup = useGym((s) => s.exportBackup);
  const importBackup = useGym((s) => s.importBackup);
  const importStrongCsv = useGym((s) => s.importStrongCsv);
  const exportSetsCsvText = useGym((s) => s.exportSetsCsvText);
  const resetAll = useGym((s) => s.resetAll);
  const loadDemo = useGym((s) => s.loadDemo);
  const exercises = useGym((s) => s.exercises);
  const [csvNote, setCsvNote] = useState<string | null>(null);

  const download = () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lockd-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const blob = new Blob([exportSetsCsvText()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lockd-sets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File, mode: "replace" | "merge") => {
    const text = await file.text();
    const parsed = JSON.parse(text) as LockdBackup;
    if (parsed.format !== BACKUP_FORMAT) {
      window.alert("That file is not a Lock’d backup.");
      return;
    }
    importBackup(parsed, mode);
  };

  const onCsv = async (file: File) => {
    const text = await file.text();
    const preview = importStrongCsv(text);
    setCsvNote(
      `Imported ${preview.workouts} sessions, ${preview.sets} sets. Skipped ${preview.skipped}.${
        preview.unmatched.length ? ` Unmapped: ${preview.unmatched.slice(0, 8).join(", ")}.` : ""
      }`,
    );
  };

  const toggleGoal = (id: string) => {
    const current = settings.goalLiftIds;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 3);
    updateSettings({ goalLiftIds: next });
  };

  const goalPool = exercises.filter(
    (row) =>
      ["seed-bench-press", "seed-back-squat", "seed-conventional-deadlift", "seed-overhead-press", "seed-barbell-row", "seed-front-squat"].includes(
        row.id,
      ) || settings.goalLiftIds.includes(row.id),
  );

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">Units, lens, and backups. The log itself lives on the locker when you are signed in.</p>
      <Link to="/locker" className="mt-4 block text-sm text-accent underline-offset-2 hover:underline">
        Open locker — handle, public stamps, published links
      </Link>

      <Section title="Units">
        <Segment
          value={settings.unitSystem}
          options={[
            ["metric", "Kilograms"],
            ["imperial", "Pounds"],
          ]}
          onChange={(unitSystem) =>
            updateSettings({
              unitSystem: unitSystem as UnitSystem,
              quickIncrementG: defaultQuickIncrementG(unitSystem as UnitSystem),
            })
          }
        />
      </Section>

      <Section title="Week starts">
        <Segment
          value={settings.weekStartDay}
          options={[
            ["monday", "Monday"],
            ["sunday", "Sunday"],
            ["saturday", "Saturday"],
          ]}
          onChange={(weekStartDay) => updateSettings({ weekStartDay: weekStartDay as WeekStartDay })}
        />
      </Section>

      <Section title="Estimated 1RM">
        <Segment
          value={settings.oneRepMaxFormula}
          options={[
            ["epley", "Epley"],
            ["brzycki", "Brzycki"],
          ]}
          onChange={(oneRepMaxFormula) =>
            updateSettings({ oneRepMaxFormula: oneRepMaxFormula as "epley" | "brzycki" })
          }
        />
        <p className="mt-2 text-xs text-subtle">Only sets of 12 reps or fewer. Warm-ups excluded.</p>
      </Section>

      <Section title="Rest timer">
        <Segment
          value={String(settings.defaultRestSeconds)}
          options={[
            ["60", "1:00"],
            ["90", "1:30"],
            ["120", "2:00"],
            ["180", "3:00"],
          ]}
          onChange={(value) => updateSettings({ defaultRestSeconds: Number(value) })}
        />
        <Toggle
          label="Auto-start after a working set"
          checked={settings.restTimerAutoStart}
          onChange={(restTimerAutoStart) => updateSettings({ restTimerAutoStart })}
        />
        <Toggle
          label="Chime when rest ends"
          checked={settings.restTimerSound}
          onChange={(restTimerSound) => updateSettings({ restTimerSound })}
        />
      </Section>

      <Section title="Appearance">
        <p className="mb-2 text-xs text-subtle">Theme</p>
        <Segment
          value={settings.themeMode}
          options={[
            ["dark", "Dark"],
            ["light", "Light"],
            ["system", "System"],
          ]}
          onChange={(themeMode) => updateSettings({ themeMode: themeMode as ThemeMode })}
        />
        <p className="mb-2 mt-4 text-xs text-subtle">Accent</p>
        <Segment
          value={settings.accentTheme}
          options={[
            ["stamp", "Stamp"],
            ["glacier", "Glacier"],
            ["moss", "Moss"],
            ["ember", "Ember"],
          ]}
          onChange={(accentTheme) => updateSettings({ accentTheme: accentTheme as AccentTheme })}
        />
        <p className="mb-2 mt-4 text-xs text-subtle">Presentation</p>
        <Segment
          value={settings.presentationMode ?? "loud"}
          options={[
            ["loud", "Loud"],
            ["calm", "Calm"],
          ]}
          onChange={(presentationMode) =>
            updateSettings({ presentationMode: presentationMode as "loud" | "calm" })
          }
        />
      </Section>

      <Section title="Goal lens">
        <p className="mb-2 text-xs text-subtle">Same log. Different dashboard emphasis.</p>
        <Segment
          value={settings.goalLens ?? "powerbuilding"}
          options={[
            ["powerbuilding", "Powerbuilding"],
            ["strength", "Strength"],
            ["hypertrophy", "Hypertrophy"],
            ["calisthenics", "Calisthenics"],
            ["hybrid", "Hybrid"],
            ["general", "General"],
          ]}
          onChange={(goalLens) => updateSettings({ goalLens: goalLens as AppSettings["goalLens"] })}
        />
      </Section>

      <Section title="Goal lifts">
        <p className="mb-2 text-xs text-subtle">Weekly verdict tracks up to three. Tap to toggle.</p>
        <div className="flex flex-wrap gap-2">
          {goalPool.map((exercise) => {
            const on = settings.goalLiftIds.includes(exercise.id);
            return (
              <button
                key={exercise.id}
                type="button"
                onClick={() => toggleGoal(exercise.id)}
                className={
                  on
                    ? "h-10 rounded-full bg-accent px-3 text-sm text-accent-ink"
                    : "h-10 rounded-full bg-raised px-3 text-sm text-ink hairline"
                }
              >
                {exercise.name}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Data">
        <div className="mb-3 rounded-xl bg-raised px-3 py-3" data-testid="history-promise">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{HISTORY_PROMISE_TITLE}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{HISTORY_PROMISE}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Signed in, every session writes to the locker. JSON and CSV are still here if you want a file in your hand.
          Strong CSV imports locally, then syncs up.
        </p>
        <div className="mt-3 space-y-2">
          <Button className="w-full" variant="secondary" onClick={download}>
            Download JSON backup
          </Button>
          <Button className="w-full" variant="secondary" onClick={downloadCsv}>
            Download sets CSV
          </Button>
          <label className="block">
            <span className="mb-1 block text-xs text-subtle">Restore Lock’d JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onImport(file, "merge");
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-subtle">Import Strong CSV</span>
            <input
              type="file"
              accept="text/csv,.csv"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onCsv(file);
              }}
            />
          </label>
          {csvNote ? <p className="text-xs text-muted">{csvNote}</p> : null}
          <SafetyBackups />
          <Button className="w-full" variant="secondary" onClick={loadDemo}>
            Load sample log
          </Button>
          <Button
            className="w-full"
            variant="danger"
            onClick={() => {
              if (window.confirm("Delete everything on this device and re-seed the library?")) resetAll();
            }}
          >
            Delete local cache
          </Button>
        </div>
      </Section>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <h2 className="mb-3 font-display text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </Card>
  );
}

function Segment({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={
            value === id
              ? "h-11 rounded-xl bg-accent text-sm text-accent-ink"
              : "h-11 rounded-xl bg-raised text-sm"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-between" onClick={() => onChange(!checked)}>
      <span className="text-sm">{label}</span>
      <span className={checked ? "text-accent text-sm font-medium" : "text-subtle text-sm"}>{checked ? "On" : "Off"}</span>
    </button>
  );
}
