import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  type AppSettings,
  type IntensityMode,
  type ThemeMode,
  type UnitSystem,
  type WeekStartDay,
} from "@/domain/types";
import { applyBackup, restoreMessage, type RestoreMode } from "@/lib/backup/apply";
import { parseBackup } from "@/lib/backup/schema";
import { takeSafetyBackup } from "@/lib/storage/safety";
import { localDateOf } from "@/domain/time";
import { defaultQuickIncrementG, lengthUnitFor, weightUnitFor } from "@/domain/units";
import { EquipmentEditor } from "@/components/app/equipment-editor";
import { GoalLiftPicker } from "@/components/app/goal-lift-picker";
import { csvFiles } from "@/lib/export/csv";
import { useGym } from "@/lib/gym/store";
import { describeImport } from "@/lib/import/summary";
import { HISTORY_PROMISE, HISTORY_PROMISE_TITLE } from "@/lib/promise";
import { SafetyBackups } from "@/components/app/safety-backups";
import { eraseAllOnDevice } from "@/lib/storage/boot";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useGym((s) => s.settings);
  const updateSettings = useGym((s) => s.updateSettings);
  const exportBackup = useGym((s) => s.exportBackup);
  const importBackup = useGym((s) => s.importBackup);
  const importStrongCsv = useGym((s) => s.importStrongCsv);
  const importHevyCsv = useGym((s) => s.importHevyCsv);
  const importOtherAppBackup = useGym((s) => s.importOtherAppBackup);
  const resetAll = useGym((s) => s.resetAll);
  const loadDemo = useGym((s) => s.loadDemo);
  const exercises = useGym((s) => s.exercises);
  const [csvNote, setCsvNote] = useState<string | null>(null);
  const [pickingGoalLifts, setPickingGoalLifts] = useState(false);
  const [backupProblems, setBackupProblems] = useState<string[] | null>(null);
  // Bumped after a restore so the Safety copies list shows the copy that was just taken.
  const [copiesShown, setCopiesShown] = useState(0);

  const download = () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lockd-backup-${localDateOf()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = (kind: keyof ReturnType<typeof csvFiles>) => {
    const state = useGym.getState();
    const file = csvFiles(
      state,
      {
        mass: weightUnitFor(state.settings.unitSystem),
        length: lengthUnitFor(state.settings.unitSystem),
      },
      localDateOf(),
    )[kind];
    // A byte-order mark so Excel reads names with accents correctly; the importer ignores it.
    const blob = new Blob(["\uFEFF", file.content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File, mode: RestoreMode) => {
    setBackupProblems(null);
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setBackupProblems(parsed.errors);
      return;
    }
    const { summary, warnings } = parsed;
    const what = `${summary.sessions} session${summary.sessions === 1 ? "" : "s"}, ${summary.sets} sets, saved ${summary.exportedAt.slice(0, 10)}`;
    const question =
      mode === "replace"
        ? `Replace your whole log with this backup (${what})? Your current log is copied to Safety copies first.`
        : `Add this backup (${what}) to your log? Sessions already here are kept as they are. Your current log is copied to Safety copies first.`;
    if (!window.confirm(question)) return;
    const result = await applyBackup(parsed.backup, mode, {
      current: exportBackup,
      apply: importBackup,
      safetyCopy: (backup) => takeSafetyBackup("before-restore", backup),
      sessions: () =>
        useGym.getState().workouts.filter((w) => w.status === "completed" || w.status === "active")
          .length,
    });
    if (!result.ok) {
      setBackupProblems([result.error]);
      return;
    }
    setCopiesShown((n) => n + 1);
    toast.success(restoreMessage(result));
    if (warnings.length) setBackupProblems(warnings);
  };

  const onCsv = async (file: File, source: "strong" | "hevy") => {
    const text = await file.text();
    setBackupProblems(null);
    setCsvNote(
      describeImport((source === "hevy" ? importHevyCsv : importStrongCsv)(text, file.name)),
    );
  };

  const onOtherAppBackup = async (file: File) => {
    const text = await file.text();
    setBackupProblems(null);
    const outcome = importOtherAppBackup(text, file.name);
    if (!outcome.ok) {
      setCsvNote(null);
      setBackupProblems(outcome.errors);
      return;
    }
    setCsvNote(describeImport(outcome.summary));
  };

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Units, lens, and backups. The log itself lives on the locker when you are signed in.
      </p>
      <Link
        to="/locker"
        className="mt-4 block text-sm text-accent underline-offset-2 hover:underline"
      >
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
          onChange={(weekStartDay) =>
            updateSettings({ weekStartDay: weekStartDay as WeekStartDay })
          }
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
        <p className="mt-2 text-xs text-subtle">
          Only sets of 12 reps or fewer. Warm-ups excluded.
        </p>
      </Section>

      <Section title="Effort">
        <Segment
          value={settings.intensityMode}
          options={[
            ["rpe", "RPE"],
            ["rir", "RIR"],
            ["none", "Off"],
          ]}
          onChange={(intensityMode) =>
            updateSettings({ intensityMode: intensityMode as IntensityMode })
          }
        />
        <p className="mt-2 text-xs text-subtle">
          RPE and RIR are stored separately and never converted. Switching hides the other; nothing
          is deleted.
        </p>
      </Section>
      <Section title="Equipment">
        <EquipmentEditor />
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
        <p className="mb-2 mt-4 text-xs text-subtle">After a warm-up set</p>
        <Segment
          value={String(settings.warmupRestSeconds ?? 0)}
          options={[
            ["0", "No timer"],
            ["30", "0:30"],
            ["45", "0:45"],
            ["60", "1:00"],
          ]}
          onChange={(value) => updateSettings({ warmupRestSeconds: Number(value) })}
        />
        <Toggle
          label="Chime when rest ends"
          checked={settings.restTimerSound}
          onChange={(restTimerSound) => updateSettings({ restTimerSound })}
        />
        <Toggle
          label="Vibrate when rest ends"
          checked={settings.restTimerVibrate ?? false}
          onChange={(restTimerVibrate) => updateSettings({ restTimerVibrate })}
        />
        <Toggle
          label="Notify when rest ends"
          checked={settings.restTimerNotification ?? false}
          onChange={(restTimerNotification) => {
            if (!restTimerNotification) {
              updateSettings({ restTimerNotification: false });
              return;
            }
            if (typeof Notification === "undefined") return;
            void Notification.requestPermission().then((permission) =>
              updateSettings({ restTimerNotification: permission === "granted" }),
            );
          }}
        />
        <p className="mt-2 text-xs text-subtle">
          Vibrate and notify work while Lock'd is open in the background. A locked phone can delay
          them, and some browsers (iPhone Safari) do not vibrate.
        </p>
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
        <p className="mb-2 text-xs text-subtle">
          The weekly verdict and stall flags track up to three. Pick none and your most-trained
          lifts are used, labelled as a guess.
        </p>
        <p className="text-sm text-ink" data-testid="goal-lifts-summary">
          {settings.goalLiftIds.length
            ? settings.goalLiftIds
                .map(
                  (id) =>
                    exercises.find((row) => row.id === id)?.name ??
                    "A lift no longer in the library",
                )
                .join(", ")
            : "None picked: using your most-trained lifts."}
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          onClick={() => setPickingGoalLifts(true)}
        >
          Choose goal lifts
        </Button>
        <GoalLiftPicker
          open={pickingGoalLifts}
          onClose={() => setPickingGoalLifts(false)}
          exercises={exercises}
          goalLiftIds={settings.goalLiftIds}
          onChange={(goalLiftIds) => updateSettings({ goalLiftIds })}
        />
      </Section>

      <Section title="Data">
        <div className="mb-3 rounded-xl bg-raised px-3 py-3" data-testid="history-promise">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
            {HISTORY_PROMISE_TITLE}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{HISTORY_PROMISE}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Signed in, every session writes to the locker. JSON and CSV are still here if you want a
          file in your hand. Strong CSV imports locally, then syncs up.
        </p>
        <div className="mt-3 space-y-2">
          <Button className="w-full" variant="secondary" onClick={download}>
            Download JSON backup
          </Button>
          <Button className="w-full" variant="secondary" onClick={() => downloadCsv("sets")}>
            Download sets CSV
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["sessions", "Sessions CSV"],
                ["exercises", "Exercises CSV"],
                ["routines", "Routines CSV"],
                ["measurements", "Measurements CSV"],
              ] as const
            ).map(([kind, label]) => (
              <Button key={kind} variant="outline" size="sm" onClick={() => downloadCsv(kind)}>
                {label}
              </Button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-subtle">Add a Lock’d backup to this log</span>
            <input
              type="file"
              accept="application/json,.json"
              data-testid="backup-merge-input"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onImport(file, "merge");
                event.target.value = "";
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-subtle">
              Replace this log with a Lock’d backup
            </span>
            <input
              type="file"
              accept="application/json,.json"
              data-testid="backup-replace-input"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onImport(file, "replace");
                event.target.value = "";
              }}
            />
          </label>
          {backupProblems ? (
            <div
              role="alert"
              data-testid="backup-problems"
              className="rounded-xl bg-raised p-3 text-xs text-muted"
            >
              <ul className="list-disc space-y-1 pl-4">
                {backupProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link
            to="/import"
            className="block text-sm text-accent underline-offset-2 hover:underline"
          >
            Import wizard: choose columns, review sessions, match exercises
          </Link>
          <label className="block">
            <span className="mb-1 block text-xs text-subtle">Import Strong CSV</span>
            <input
              type="file"
              accept="text/csv,.csv"
              data-testid="strong-csv-input"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = ""; // so choosing the same file again still fires
                if (file) void onCsv(file, "strong");
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-subtle">Import Hevy CSV</span>
            <input
              type="file"
              accept="text/csv,.csv"
              data-testid="hevy-csv-input"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = ""; // so choosing the same file again still fires
                if (file) void onCsv(file, "hevy");
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-subtle">
              Import a backup from another app (JSON)
            </span>
            <input
              type="file"
              accept="application/json,.json"
              data-testid="other-backup-input"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = ""; // so choosing the same file again still fires
                if (file) void onOtherAppBackup(file);
              }}
            />
          </label>
          {csvNote ? (
            <p className="text-xs text-muted" data-testid="csv-note">
              {csvNote}
            </p>
          ) : null}
          <SafetyBackups key={copiesShown} />
          <Button className="w-full" variant="secondary" onClick={loadDemo}>
            Load sample log
          </Button>
          <Button
            className="w-full"
            variant="danger"
            onClick={() => {
              if (
                window.confirm(
                  "Delete everything on this device and re-seed the library? This also deletes the safety copies and the old saved copy of your log.",
                )
              ) {
                resetAll();
                void eraseAllOnDevice();
              }
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
    <button
      type="button"
      className="mt-3 flex min-h-11 w-full items-center justify-between"
      onClick={() => onChange(!checked)}
    >
      <span className="text-sm">{label}</span>
      <span className={checked ? "text-accent text-sm font-medium" : "text-subtle text-sm"}>
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}
