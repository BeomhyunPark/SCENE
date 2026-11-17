import type { AssignmentChange, BoardParticipant, Group, GroupBoard } from "../api/groups";
import { membersOf } from "./groupBoardView";

/**
 * Drag and drop on the group board (#343) as plain data, so the screen, the keyboard path and the tests share
 * one rule. A drop puts people in a group in front of `beforeId` (null is the end) or back in the 미배정 pool.
 * When every dragged person is already in the target group, it is a reorder of that group; otherwise only the
 * people from elsewhere move (one assignment request, `beforeParticipantId` each) and the rest stay put.
 */
export type DropTarget = { kind: "group"; groupId: string; beforeId: string | null } | { kind: "pool" };

export type DropPlan =
  | { kind: "assign"; toGroupId: string | null; changes: AssignmentChange[] }
  | { kind: "reorder"; groupId: string; participantIds: string[] };

/** Who moves when `participantId` is dragged: the checked people when it is one of them, else that person. */
export function draggedPeople(participantId: string, selected: ReadonlySet<string>, people: BoardParticipant[]): string[] {
  if (!selected.has(participantId)) return [participantId];
  const known = new Set(people.map((person) => person.participantId));
  // Keep the board order (groups by position, then the pool by name) so several people land in a stable order.
  const order = new Map(people.map((person, index) => [person.participantId, index]));
  return [...selected].filter((id) => known.has(id)).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function planDrop(board: GroupBoard, ids: string[], target: DropTarget): DropPlan | null {
  const byId = new Map(board.participants.map((person) => [person.participantId, person]));
  const movers = ids.filter((id) => byId.has(id));
  if (movers.length === 0) return null;
  if (target.kind === "pool") {
    const leaving = movers.filter((id) => byId.get(id)!.groupId !== null);
    if (leaving.length === 0) return null;
    return {
      kind: "assign",
      toGroupId: null,
      changes: leaving.map((id) => ({ participantId: id, fromGroupId: byId.get(id)!.groupId, toGroupId: null })),
    };
  }
  const members = membersOf(board.participants, target.groupId).map((person) => person.participantId);
  const moving = new Set(movers);
  const arriving = movers.filter((id) => byId.get(id)!.groupId !== target.groupId);
  if (arriving.length === 0) {
    // Dropped on one of the dragged rows: nothing to do.
    if (target.beforeId !== null && moving.has(target.beforeId)) return null;
    const rest = members.filter((id) => !moving.has(id));
    const anchor = target.beforeId === null ? -1 : rest.indexOf(target.beforeId);
    const at = anchor < 0 ? rest.length : anchor;
    const placed = movers.filter((id) => members.includes(id));
    const next = [...rest.slice(0, at), ...placed, ...rest.slice(at)];
    if (next.join() === members.join()) return null;
    return { kind: "reorder", groupId: target.groupId, participantIds: next };
  }
  // The anchor must be a member that stays; a dragged anchor means "where the drag started": use the next one.
  let before: string | null = target.beforeId;
  if (before !== null && (moving.has(before) || !members.includes(before))) {
    const index = members.indexOf(before);
    before = index < 0 ? null : (members.slice(index + 1).find((id) => !moving.has(id)) ?? null);
  }
  return {
    kind: "assign",
    toGroupId: target.groupId,
    changes: arriving.map((id) => ({
      participantId: id,
      fromGroupId: byId.get(id)!.groupId,
      toGroupId: target.groupId,
      beforeParticipantId: before,
    })),
  };
}

/** The board as it will look after the plan, so the screen can move people before the server answers. */
export function applyPlan(board: GroupBoard, plan: DropPlan): GroupBoard {
  const order = new Map<string, number>();
  const write = (ids: string[]) => ids.forEach((id, index) => order.set(id, index));
  if (plan.kind === "reorder") {
    write(plan.participantIds);
  } else if (plan.toGroupId !== null) {
    const arriving = new Set(plan.changes.map((change) => change.participantId));
    const ids = membersOf(board.participants, plan.toGroupId)
      .map((person) => person.participantId)
      .filter((id) => !arriving.has(id));
    for (const change of plan.changes) {
      const anchor = change.beforeParticipantId ? ids.indexOf(change.beforeParticipantId) : -1;
      if (anchor < 0) ids.push(change.participantId);
      else ids.splice(anchor, 0, change.participantId);
    }
    write(ids);
  }
  const moved = new Map(plan.kind === "assign" ? plan.changes.map((change) => [change.participantId, change.toGroupId]) : []);
  return {
    ...board,
    participants: board.participants.map((person) => {
      const groupId = moved.has(person.participantId) ? moved.get(person.participantId)! : person.groupId;
      const changed = moved.has(person.participantId);
      return {
        ...person,
        groupId,
        leader: changed ? false : person.leader,
        position: groupId === null ? null : (order.get(person.participantId) ?? person.position),
      };
    }),
  };
}

/** Group order after dropping `groupId` in front of `beforeGroupId` (null is the end); null when unchanged. */
export function planGroupOrder(groups: Group[], groupId: string, beforeGroupId: string | null): string[] | null {
  const ids = groups.map((group) => group.groupId);
  const rest = ids.filter((id) => id !== groupId);
  const at = beforeGroupId === null || beforeGroupId === groupId ? -1 : rest.indexOf(beforeGroupId);
  if (beforeGroupId === groupId) return null;
  const next = at < 0 ? [...rest, groupId] : [...rest.slice(0, at), groupId, ...rest.slice(at)];
  return next.join() === ids.join() ? null : next;
}

/** One step up or down within the group for the keyboard; null at either end. */
export function stepPlan(board: GroupBoard, participantId: string, by: -1 | 1): DropPlan | null {
  const person = board.participants.find((item) => item.participantId === participantId);
  if (!person?.groupId) return null;
  const ids = membersOf(board.participants, person.groupId).map((item) => item.participantId);
  const from = ids.indexOf(participantId);
  const to = from + by;
  if (to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return { kind: "reorder", groupId: person.groupId, participantIds: ids };
}
