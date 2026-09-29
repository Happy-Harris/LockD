import { toast } from "sonner";
import type { ProgramFile } from "@/domain/types";
import { nextProgramSession, unresolvedProgramRows } from "./programs";
import { useGym } from "./store";

function names(list: Array<{ name: string }>): string {
  return list.map((item) => item.name).join(", ");
}

/** Says out loud which exercises of a program session are not in the library, so none vanishes silently. */
function unresolvedFor(programId: string, sessionId: string | undefined) {
  const state = useGym.getState();
  const program = state.programs.find((row) => row.id === programId);
  if (!program) return [];
  const sessions = state.programSessions.filter((row) => row.programId === programId);
  const session = sessionId
    ? sessions.find((row) => row.id === sessionId)
    : nextProgramSession(program, sessions);
  if (!session) return [];
  const rows = state.programExercises.filter((row) => row.programSessionId === session.id);
  return unresolvedProgramRows(rows, state.exercises);
}

export function useStartProgramSession() {
  const start = useGym((s) => s.startFromProgramSession);
  return (programId: string, sessionId?: string) => {
    const left = unresolvedFor(programId, sessionId);
    const workoutId = start(programId, sessionId);
    if (left.length > 0) {
      toast.warning(`Left out of this session: ${names(left)}. Not in your library.`, {
        duration: 8000,
      });
    }
    return workoutId;
  };
}

export function useImportProgram() {
  const importProgram = useGym((s) => s.importProgram);
  return (file: ProgramFile) => {
    const id = importProgram(file);
    const state = useGym.getState();
    const rows = state.programExercises.filter((row) =>
      state.programSessions.some((s) => s.programId === id && s.id === row.programSessionId),
    );
    const left = unresolvedProgramRows(rows, state.exercises);
    if (left.length > 0) {
      toast.warning(
        `Not in your library: ${names(left)}. They stay in the program and are skipped when you start it.`,
        { duration: 10000 },
      );
    }
    return id;
  };
}
