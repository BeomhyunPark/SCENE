import { describe, expect, it } from "vitest";
import type { BoardParticipant, GroupBoard } from "../api/groups";
import { applyPlan, draggedPeople, planDrop, planGroupOrder, stepPlan } from "./groupDrop";
import { membersOf } from "./groupBoardView";

function person(id: string, groupId: string | null, position: number | null, leader = false): BoardParticipant {
  return {
    participantId: id,
    applicationId: null,
    name: id,
    cohort: null,
    gender: null,
    attendance: "FULL",
    middleGroup: null,
    cell: null,
    newcomer: null,
    groupId,
    leader,
    position,
    publishedGroupId: null,
    publishedLeader: false,
    slotIds: null,
  };
}

function board(participants: BoardParticipant[]): GroupBoard {
  return {
    eventStatus: "ACTIVE",
    boardVersion: 1,
    groups: [
      { groupId: "g1", name: "1조", sortOrder: 0, version: 0 },
      { groupId: "g2", name: "2조", sortOrder: 1, version: 0 },
      { groupId: "g3", name: "3조", sortOrder: 2, version: 0 },
    ],
    participants,
    withdrawn: [],
    publication: {
      lastPublishedAt: null,
      lastPublishedByDisplayName: null,
      lastPublishedBoardVersion: null,
      activeCount: 0,
      assignedCount: 0,
      unassignedCount: 0,
      changedParticipantCount: 0,
      groupChanges: 0,
      hasUnpublishedChanges: false,
    },
    slots: null,
  };
}

const order = (b: GroupBoard, groupId: string) => membersOf(b.participants, groupId).map((p) => p.participantId);

describe("group drop (#343)", () => {
  const base = board([
    person("a", "g1", 0, true),
    person("b", "g1", 1),
    person("c", "g1", 2),
    person("d", "g2", 0),
    person("x", null, null),
    person("y", null, null),
  ]);

  it("puts an unassigned person in front of the row they were dropped on, and shows it before the server answers", () => {
    const plan = planDrop(base, ["x"], { kind: "group", groupId: "g1", beforeId: "b" });
    expect(plan).toEqual({
      kind: "assign",
      toGroupId: "g1",
      changes: [{ participantId: "x", fromGroupId: null, toGroupId: "g1", beforeParticipantId: "b" }],
    });
    expect(order(applyPlan(base, plan!), "g1")).toEqual(["a", "x", "b", "c"]);
  });

  it("reorders within a group when everyone dragged is already there", () => {
    const plan = planDrop(base, ["c"], { kind: "group", groupId: "g1", beforeId: "a" });
    expect(plan).toEqual({ kind: "reorder", groupId: "g1", participantIds: ["c", "a", "b"] });
    expect(planDrop(base, ["a"], { kind: "group", groupId: "g1", beforeId: null })).toEqual({
      kind: "reorder",
      groupId: "g1",
      participantIds: ["b", "c", "a"],
    });
    // Dropped on itself, or where it already is: nothing.
    expect(planDrop(base, ["b"], { kind: "group", groupId: "g1", beforeId: "b" })).toBeNull();
    expect(planDrop(base, ["b"], { kind: "group", groupId: "g1", beforeId: "c" })).toBeNull();
  });

  it("moves the checked people together, from several groups, keeping the leader mark off the movers", () => {
    const ids = draggedPeople("x", new Set(["a", "x", "d"]), base.participants);
    expect(ids).toEqual(["a", "d", "x"]);
    const plan = planDrop(base, ids, { kind: "group", groupId: "g3", beforeId: null });
    expect(plan?.kind).toBe("assign");
    const after = applyPlan(base, plan!);
    expect(order(after, "g3")).toEqual(["a", "d", "x"]);
    expect(after.participants.find((p) => p.participantId === "a")?.leader).toBe(false);
    expect(draggedPeople("y", new Set(["a"]), base.participants)).toEqual(["y"]);
  });

  it("unassigns on the pool and ignores people already unassigned", () => {
    expect(planDrop(base, ["b", "x"], { kind: "pool" })).toEqual({
      kind: "assign",
      toGroupId: null,
      changes: [{ participantId: "b", fromGroupId: "g1", toGroupId: null }],
    });
    expect(planDrop(base, ["x"], { kind: "pool" })).toBeNull();
  });

  it("uses the next staying member when the anchor is one of the dragged people", () => {
    const plan = planDrop(base, ["b", "x"], { kind: "group", groupId: "g1", beforeId: "b" });
    expect(plan).toMatchObject({ kind: "assign", changes: [{ participantId: "x", beforeParticipantId: "c" }] });
  });

  it("reorders groups and steps a member with the keyboard", () => {
    expect(planGroupOrder(base.groups, "g3", "g1")).toEqual(["g3", "g1", "g2"]);
    expect(planGroupOrder(base.groups, "g1", null)).toEqual(["g2", "g3", "g1"]);
    expect(planGroupOrder(base.groups, "g1", "g2")).toBeNull();
    expect(stepPlan(base, "b", -1)).toEqual({ kind: "reorder", groupId: "g1", participantIds: ["b", "a", "c"] });
    expect(stepPlan(base, "a", -1)).toBeNull();
    expect(stepPlan(base, "x", 1)).toBeNull();
  });
});
