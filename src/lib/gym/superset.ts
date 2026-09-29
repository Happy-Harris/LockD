import type { WorkoutExercise } from "@/domain/types";

type Block = Pick<WorkoutExercise, "id" | "order" | "supersetGroup">;

const inOrder = <T extends Block>(blocks: readonly T[]) =>
  [...blocks].sort((a, b) => a.order - b.order);

/** "A1", "A2", "B1"...: one letter per superset in workout order, a number per member. Blocks outside a superset get none. */
export function supersetLabels(blocks: readonly Block[]): Map<string, string> {
  const letters = new Map<string, string>();
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const block of inOrder(blocks)) {
    const group = block.supersetGroup;
    if (!group) continue;
    if (!letters.has(group)) letters.set(group, String.fromCharCode(65 + (letters.size % 26)));
    const n = (counts.get(group) ?? 0) + 1;
    counts.set(group, n);
    labels.set(block.id, `${letters.get(group)}${n}`);
  }
  return labels;
}

/** True when nothing later in the workout shares this block's superset, so the rest timer should run after it. */
export function endsSuperset(block: Block, blocks: readonly Block[]): boolean {
  if (!block.supersetGroup) return true;
  return !blocks.some(
    (other) => other.order > block.order && other.supersetGroup === block.supersetGroup,
  );
}

/**
 * The group each block should have after linking (`link: true`) or unlinking (`link: false`) it with
 * the next block. Returns only the blocks that change. Unlinking leaves a group of one, which is
 * cleared, so a superset always has two or more members.
 */
export function relinkSuperset(
  blocks: readonly Block[],
  blockId: string,
  link: boolean,
  newGroup: () => string,
): Map<string, string | undefined> {
  const ordered = inOrder(blocks);
  const index = ordered.findIndex((block) => block.id === blockId);
  const changes = new Map<string, string | undefined>();
  const current = ordered[index];
  const next = ordered[index + 1];
  if (!current) return changes;

  if (link) {
    if (!next) return changes;
    const group = current.supersetGroup ?? next.supersetGroup ?? newGroup();
    changes.set(current.id, group);
    changes.set(next.id, group);
    // A group being merged into keeps every existing member.
    for (const other of ordered) {
      if (other.supersetGroup && other.supersetGroup === next.supersetGroup)
        changes.set(other.id, group);
    }
    return changes;
  }

  // Unlink from the next block: split the group after `current`.
  const group = current.supersetGroup;
  if (!group || !next || next.supersetGroup !== group) return changes;
  const tail = ordered.slice(index + 1).filter((block) => block.supersetGroup === group);
  const head = ordered.slice(0, index + 1).filter((block) => block.supersetGroup === group);
  if (tail.length >= 2) {
    const tailGroup = newGroup();
    for (const block of tail) changes.set(block.id, tailGroup);
  } else {
    for (const block of tail) changes.set(block.id, undefined);
  }
  if (head.length < 2) for (const block of head) changes.set(block.id, undefined);
  return changes;
}
