import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIP_PURGE_GRACE_MS, UNDO_WINDOW_MS, clipIdsForSets, withoutClips } from "./clips";
import { useGym } from "./store";

// The video files live in IndexedDB; here the vault only records which files were asked to go.
const vault = vi.hoisted(() => ({ deleted: [] as string[] }));
vi.mock("./vault", () => ({
  deleteClipBlob: vi.fn(async (id: string) => {
    vault.deleted.push(id);
  }),
  putClipBlob: vi.fn(async () => undefined),
  getClipBlob: vi.fn(async () => undefined),
  CLIP_MAX_BYTES: 28 * 1024 * 1024,
}));

const meta = (id: string, setId: string, workoutId: string) => ({
  id,
  setId,
  workoutId,
  exerciseId: "e",
  exerciseName: "Bench Press",
  createdAt: "2026-09-29T10:00:00.000Z",
  localDate: "2026-09-29",
  mimeType: "video/mp4",
});

/** An active workout with two exercises and a clip on the first set of each. */
function setup(prefix = "clip") {
  const state = useGym.getState();
  const [first, second] = state.exercises.filter((row) => row.trackingType === "weight_reps");
  const workoutId = state.startEmptyWorkout("Clips");
  useGym.getState().addExerciseToWorkout(workoutId, first!.id);
  useGym.getState().addExerciseToWorkout(workoutId, second!.id);
  const blocks = useGym
    .getState()
    .workoutExercises.filter((row) => row.workoutId === workoutId)
    .sort((a, b) => a.order - b.order);
  const firstSet = (blockId: string) =>
    useGym
      .getState()
      .workoutSets.filter((row) => row.workoutExerciseId === blockId)
      .sort((a, b) => a.order - b.order)[0]!;
  const a = firstSet(blocks[0]!.id);
  const b = firstSet(blocks[1]!.id);
  useGym.getState().attachClip(meta(`${prefix}-a`, a.id, workoutId));
  useGym.getState().attachClip(meta(`${prefix}-b`, b.id, workoutId));
  // Re-read after attaching: the rows now carry their clip, as the undo toast's copy does in the app.
  return { workoutId, blocks, a: firstSet(blocks[0]!.id), b: firstSet(blocks[1]!.id) };
}

const clipIds = () =>
  useGym
    .getState()
    .clips.map((clip) => clip.id)
    .sort();

beforeEach(() => {
  useGym.getState().resetAll();
  vault.deleted.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("clip helpers", () => {
  it("finds the clips of some sets and drops clips by id", () => {
    const clips = [meta("c1", "s1", "w"), meta("c2", "s2", "w"), meta("c3", "s3", "w")];
    expect(clipIdsForSets(clips, ["s1", "s3"])).toEqual(["c1", "c3"]);
    expect(clipIdsForSets(clips, [])).toEqual([]);
    expect(withoutClips(clips, ["c2"]).map((c) => c.id)).toEqual(["c1", "c3"]);
  });
});

describe("removing an exercise or discarding a workout takes its clips with it (plan I-34)", () => {
  it("removing an exercise removes its clip and its file, and only its own", () => {
    const { blocks } = setup();
    useGym.getState().removeExerciseFromWorkout(blocks[0]!.id);
    expect(clipIds()).toEqual(["clip-b"]);
    expect(vault.deleted).toEqual(["clip-a"]);
    // The clip's set row is gone with it, so nothing points at a missing clip.
    expect(useGym.getState().workoutSets.some((row) => row.clipId === "clip-a")).toBe(false);
  });

  it("discarding a workout removes all its clips, and leaves another workout's clip alone", () => {
    const first = setup("first");
    useGym.getState().finishWorkout(first.workoutId);
    const other = setup("other");
    useGym.getState().discardWorkout(other.workoutId);
    expect(clipIds()).toEqual(["first-a", "first-b"]);
    expect(vault.deleted.sort()).toEqual(["other-a", "other-b"]);
    // The finished workout kept its clips, and each still points at a set that exists.
    for (const clip of useGym.getState().clips) {
      expect(useGym.getState().workoutSets.some((row) => row.id === clip.setId)).toBe(true);
    }
  });
});

describe("deleting one set keeps its clip through the undo window", () => {
  it("keeps the clip and the file at first, so Undo finds them", () => {
    vi.useFakeTimers();
    const { a } = setup();
    useGym.getState().deleteSet(a.id);
    expect(clipIds()).toContain("clip-a");
    expect(vault.deleted).toEqual([]);

    useGym.getState().restoreSet(a);
    const restored = useGym.getState().workoutSets.find((row) => row.id === a.id);
    expect(restored?.clipId).toBe("clip-a");
  });

  it("after the window, an undone delete loses nothing", () => {
    vi.useFakeTimers();
    const { a } = setup();
    useGym.getState().deleteSet(a.id);
    useGym.getState().restoreSet(a);
    vi.advanceTimersByTime(UNDO_WINDOW_MS + CLIP_PURGE_GRACE_MS + 1);
    expect(clipIds()).toContain("clip-a");
    expect(vault.deleted).toEqual([]);
  });

  it("after the window, a delete that was not undone removes the clip and its file, once", () => {
    vi.useFakeTimers();
    const { a } = setup();
    useGym.getState().deleteSet(a.id);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(vault.deleted).toEqual([]); // still inside the window plus grace
    vi.advanceTimersByTime(CLIP_PURGE_GRACE_MS + 1);
    expect(clipIds()).toEqual(["clip-b"]);
    expect(vault.deleted).toEqual(["clip-a"]);
  });

  it("an Undo pressed after the clip was removed brings the set back without a dangling clip", () => {
    vi.useFakeTimers();
    const { a } = setup();
    useGym.getState().deleteSet(a.id);
    vi.advanceTimersByTime(UNDO_WINDOW_MS + CLIP_PURGE_GRACE_MS + 1);
    useGym.getState().restoreSet(a); // a toast held open by hovering can be pressed this late
    const restored = useGym.getState().workoutSets.find((row) => row.id === a.id);
    expect(restored).toBeDefined();
    expect(restored?.clipId).toBeUndefined();
  });

  it("deleting a set with no clip does nothing to any file", () => {
    vi.useFakeTimers();
    const { blocks } = setup();
    const plain = useGym
      .getState()
      .workoutSets.filter((row) => row.workoutExerciseId === blocks[0]!.id)
      .sort((x, y) => x.order - y.order)[1]!;
    useGym.getState().deleteSet(plain.id);
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(vault.deleted).toEqual([]);
    expect(clipIds()).toEqual(["clip-a", "clip-b"]);
  });
});
