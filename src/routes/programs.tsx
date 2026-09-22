import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { Page } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProgramFile } from "@/domain/types";
import { PROGRAM_FORMAT } from "@/domain/types";
import { PROGRAM_PACKS } from "@/lib/gym/programs";
import { useGymDerived } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";

export const Route = createFileRoute("/programs")({ component: ProgramsPage });

function ProgramsPage() {
  const navigate = useNavigate();
  const { programs, activeProgram, nextProgram, activeWeek } = useGymDerived();
  const installProgramPack = useGym((s) => s.installProgramPack);
  const startFromProgramSession = useGym((s) => s.startFromProgramSession);
  const importProgram = useGym((s) => s.importProgram);

  const onImport = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as ProgramFile;
    if (parsed.format !== PROGRAM_FORMAT) {
      window.alert("That file is not a Lock’d program.");
      return;
    }
    const id = importProgram(parsed);
    void navigate({ to: "/programs/$id", params: { id } });
  };

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Programs</h1>
      <p className="mt-1 text-sm text-muted">
        Multi-week blocks with progression rules and deloads. Publish a link, install one, or keep a file.
      </p>

      {activeProgram && nextProgram ? (
        <Card className="mt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Active block</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">{activeProgram.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Week {activeProgram.currentWeek} of {activeProgram.weekCount}
            {activeWeek?.isDeload ? " · deload" : ""}
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => {
              startFromProgramSession(activeProgram.id, nextProgram.id);
              void navigate({ to: "/workout" });
            }}
          >
            <Play className="size-4" />
            Start {nextProgram.name}
          </Button>
        </Card>
      ) : null}

      <div className="mt-6 space-y-2">
        {programs
          .filter((row) => !row.isArchived)
          .map((program) => (
            <Link key={program.id} to="/programs/$id" params={{ id: program.id }}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{program.name}</p>
                  <p className="text-xs text-muted">
                    {program.weekCount} weeks · week {program.currentWeek}
                  </p>
                </div>
                {program.isActive ? <Badge tone="accent">Active</Badge> : null}
              </Card>
            </Link>
          ))}
      </div>

      <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Creator packs</h2>
      <p className="mt-1 text-sm text-muted">Install a pack, then edit, duplicate, substitute, or publish a link.</p>
      <div className="mt-3 space-y-2">
        {PROGRAM_PACKS.map((pack) => (
          <Card key={pack.id}>
            <p className="font-medium">{pack.name}</p>
            <p className="mt-1 text-sm text-muted">{pack.notes}</p>
            <p className="mt-2 text-xs text-subtle">
              {pack.weeks.length} weeks · {pack.sessions.length} sessions · {pack.lens}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = installProgramPack(pack.id);
                if (id) void navigate({ to: "/programs/$id", params: { id } });
              }}
            >
              Install
            </Button>
          </Card>
        ))}
      </div>

      <label className="mt-6 block">
        <span className="mb-1 block text-xs text-subtle">Import program JSON</span>
        <input
          type="file"
          accept="application/json,.json"
          className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onImport(file);
          }}
        />
      </label>
    </Page>
  );
}
