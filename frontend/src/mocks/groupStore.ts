import { localEvent } from "./fixtures/seed";
import { eventById, spacesFor } from "./operatorStore";
import { checkInCandidates } from "./participantStore";
import { permissionsFor } from "./taskStore";

/**
 * Shaped like GroupController (#299). Write order follows backend/docs/api.md "조 편성":
 * 404·403 NOT_A_MEMBER → 403 FORBIDDEN → 400 body → 409 event state → 404 target → 409 version·conflict
 * → 409 eligibility·rules → 200. Reads are not blocked by event state. Publishing (#300) is not mocked:
 * the board always reads "never published".
 */
type Attendance = "FULL" | "PARTIAL" | "WORSHIP_ONLY";

type Person = {
  participantId: string;
  name: string;
  cohort: string | null;
  gender: { optionId: string; label: string } | null;
  attendance: Attendance;
  middleGroup: string | null;
  cell: string | null;
  submitted: boolean;
};

type GroupRow = { groupId: string; name: string; sortOrder: number; version: number };
type Assignment = { groupId: string | null; leader: boolean };
type Log = { participantId: string; from: string | null; to: string | null; cause: "MOVE" | "LEADER" | "GROUP_DELETED"; actorId: string };

type Board = {
  version: number;
  groups: GroupRow[];
  assignments: Map<string, Assignment>;
  people: Person[];
  logs: Log[];
};

export type GroupFailure = {
  status: number;
  code: string;
  errors?: { field: string }[];
  version?: number;
  boardVersion?: number;
  conflicts?: { participantId: string; currentGroupId: string | null }[];
  reason?: string;
  participantIds?: string[];
};

const NAME_MAX = 50;
const GROUPS_MAX = 100;
const CHANGES_MAX = 200;
const LEADERS_MAX = 3;

const FEMALE = { optionId: "opt_female", label: "여" };
const MALE = { optionId: "opt_male", label: "남" };

let boards = new Map<string, Board>();

export function resetGroupStore(): void {
  boards = new Map([[localEvent.eventId, newBoard(seedPeople())]]);
}
resetGroupStore();

/** Test and mock-click seam: a retreat-sized roster (`count` people, `groups` empty groups named 1조…). */
export function seedLargeGroupBoard(eventId: string, count: number, groups: number): void {
  const board = newBoard(largePeople(count));
  for (let index = 0; index < groups; index += 1) {
    board.groups.push({ groupId: crypto.randomUUID(), name: `${index + 1}조`, sortOrder: index, version: 0 });
  }
  boards.set(eventId, board);
}

/** Test seam: a group made by another operator before this screen loaded or after. */
export function seedGroup(eventId: string, name: string): string {
  const board = boardOf(eventId);
  const row = { groupId: crypto.randomUUID(), name, sortOrder: board.groups.length, version: 0 };
  board.groups.push(row);
  board.version += 1;
  return row.groupId;
}

/** Test seam: another operator moves someone (or marks a leader) without this screen knowing. */
export function moveAsOtherOperator(eventId: string, participantId: string, groupId: string | null, leader = false): void {
  const board = boardOf(eventId);
  board.assignments.set(participantId, { groupId, leader: groupId !== null && leader });
  if (leader && groupId) {
    const group = board.groups.find((row) => row.groupId === groupId);
    if (group) group.version += 1;
  }
  board.version += 1;
}

/** Test seam: another operator renames a group, bumping its version. */
export function renameAsOtherOperator(eventId: string, groupId: string, name: string): void {
  const board = boardOf(eventId);
  const group = board.groups.find((row) => row.groupId === groupId);
  if (!group) return;
  group.name = name;
  group.version += 1;
  board.version += 1;
}

/** Test seam: the application was withdrawn after the board was loaded. */
export function withdrawGroupParticipant(eventId: string, participantId: string): void {
  const person = peopleOf(eventId).find((item) => item.participantId === participantId);
  if (person) person.submitted = false;
}

export function groupPeople(eventId: string): readonly { participantId: string; name: string; cohort: string | null }[] {
  return peopleOf(eventId);
}

export function groupAssignmentLogs(eventId: string): readonly Log[] {
  return boardOf(eventId).logs;
}

export function readBoard(eventId: string, actorId: string) {
  const gate = readGate(eventId, actorId);
  if (gate) return gate;
  const board = boardOf(eventId);
  const people = peopleOf(eventId);
  const active = people
    .filter((person) => person.submitted)
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.participantId.localeCompare(b.participantId));
  const assigned = active.filter((person) => assignmentOf(board, person.participantId).groupId !== null).length;
  return {
    eventStatus: eventById(eventId)!.lifecycleStatus,
    boardVersion: board.version,
    groups: [...board.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => ({ ...group })),
    participants: active.map((person) => {
      const assignment = assignmentOf(board, person.participantId);
      return {
        participantId: person.participantId,
        name: person.name,
        cohort: person.cohort,
        gender: person.gender,
        attendance: person.attendance,
        middleGroup: person.middleGroup,
        cell: person.cell,
        groupId: assignment.groupId,
        leader: assignment.leader,
        publishedGroupId: null,
        publishedLeader: false,
      };
    }),
    withdrawn: people
      .filter((person) => !person.submitted && board.assignments.has(person.participantId))
      .map((person) => ({
        participantId: person.participantId,
        name: person.name,
        groupId: assignmentOf(board, person.participantId).groupId,
      })),
    publication: {
      lastPublishedAt: null,
      lastPublishedByDisplayName: null,
      lastPublishedBoardVersion: null,
      activeCount: active.length,
      assignedCount: assigned,
      unassignedCount: active.length - assigned,
      changedParticipantCount: assigned,
      groupChanges: board.groups.length,
      hasUnpublishedChanges: assigned > 0 || board.groups.length > 0,
    },
  };
}

export function createGroup(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const name = readName(body);
  if (name === null) return field("name");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  if (board.groups.some((group) => group.name === name)) return { status: 409, code: "CONFLICT" };
  if (board.groups.length >= GROUPS_MAX) return { status: 409, code: "CONFLICT" };
  const group = { groupId: crypto.randomUUID(), name, sortOrder: board.groups.length, version: 0 };
  board.groups.push(group);
  board.version += 1;
  return { group: { ...group }, boardVersion: board.version };
}

export function renameGroup(eventId: string, groupId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const name = readName(body);
  if (name === null) return field("name");
  const expected = isRecord(body) ? body.expectedVersion : undefined;
  if (!isCount(expected)) return field("expectedVersion");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const group = board.groups.find((row) => row.groupId === groupId);
  if (!group) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (group.version !== expected) return { status: 409, code: "CONCURRENT_MODIFICATION", version: group.version };
  if (group.name === name) return { group: { ...group }, boardVersion: board.version };
  if (board.groups.some((row) => row.groupId !== groupId && row.name === name)) return { status: 409, code: "CONFLICT" };
  group.name = name;
  group.version += 1;
  board.version += 1;
  return { group: { ...group }, boardVersion: board.version };
}

export function deleteGroup(eventId: string, groupId: string, actorId: string, url: URL) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const raw = url.searchParams.get("expectedVersion");
  const expected = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  if (expected === null) return field("expectedVersion");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const group = board.groups.find((row) => row.groupId === groupId);
  if (!group) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (group.version !== expected) return { status: 409, code: "CONCURRENT_MODIFICATION", version: group.version };
  let unassignedCount = 0;
  for (const [participantId, assignment] of board.assignments) {
    if (assignment.groupId !== groupId) continue;
    board.assignments.set(participantId, { groupId: null, leader: false });
    board.logs.push({ participantId, from: groupId, to: null, cause: "GROUP_DELETED", actorId });
    unassignedCount += 1;
  }
  board.groups = board.groups
    .filter((row) => row.groupId !== groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row, index) => ({ ...row, sortOrder: index }));
  board.version += 1;
  return { unassignedCount, boardVersion: board.version };
}

export function reorderGroups(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const ids = isRecord(body) ? body.groupIds : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return field("groupIds");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const known = new Set(board.groups.map((group) => group.groupId));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    return { status: 409, code: "CONFLICT" };
  }
  const current = [...board.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => group.groupId);
  if (current.every((id, index) => id === ids[index])) return { boardVersion: board.version };
  for (const group of board.groups) group.sortOrder = ids.indexOf(group.groupId);
  board.version += 1;
  return { boardVersion: board.version };
}

export function assign(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const changes = readChanges(body);
  if (!changes) return field("changes");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const people = peopleOf(eventId);
  for (const change of changes) {
    if (!people.some((person) => person.participantId === change.participantId)) {
      return { status: 404, code: "RESOURCE_NOT_FOUND" };
    }
    if (change.toGroupId !== null && !board.groups.some((group) => group.groupId === change.toGroupId)) {
      return { status: 404, code: "RESOURCE_NOT_FOUND" };
    }
  }
  const movers: typeof changes = [];
  const conflicts: { participantId: string; currentGroupId: string | null }[] = [];
  let alreadyApplied = 0;
  for (const change of changes) {
    const current = assignmentOf(board, change.participantId).groupId;
    if (current === change.toGroupId) alreadyApplied += 1;
    else if (current === change.fromGroupId) movers.push(change);
    else conflicts.push({ participantId: change.participantId, currentGroupId: current });
  }
  if (conflicts.length > 0) {
    return { status: 409, code: "CONCURRENT_MODIFICATION", conflicts, boardVersion: board.version };
  }
  const notSubmitted = movers
    .filter((change) => change.toGroupId !== null)
    .filter((change) => !people.find((person) => person.participantId === change.participantId)!.submitted)
    .map((change) => change.participantId);
  if (notSubmitted.length > 0) {
    return {
      status: 409,
      code: "INVALID_STATE_TRANSITION",
      reason: "APPLICATION_NOT_SUBMITTED",
      participantIds: notSubmitted,
    };
  }
  for (const change of movers) {
    board.assignments.set(change.participantId, { groupId: change.toGroupId, leader: false });
    board.logs.push({ participantId: change.participantId, from: change.fromGroupId, to: change.toGroupId, cause: "MOVE", actorId });
  }
  if (movers.length > 0) board.version += 1;
  return { changed: movers.length, alreadyApplied, boardVersion: board.version };
}

export function setLeaders(eventId: string, groupId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const record = isRecord(body) ? body : {};
  const ids = record.participantIds;
  if (
    !Array.isArray(ids) ||
    !ids.every((id) => typeof id === "string") ||
    ids.length > LEADERS_MAX ||
    new Set(ids).size !== ids.length
  ) {
    return field("participantIds");
  }
  if (!isCount(record.expectedVersion)) return field("expectedVersion");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const group = board.groups.find((row) => row.groupId === groupId);
  if (!group) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (group.version !== record.expectedVersion) {
    return { status: 409, code: "CONCURRENT_MODIFICATION", version: group.version };
  }
  const people = peopleOf(eventId);
  const notMembers = (ids as string[]).filter((id) => {
    const person = people.find((item) => item.participantId === id);
    return !person || !person.submitted || assignmentOf(board, id).groupId !== groupId;
  });
  if (notMembers.length > 0) {
    return { status: 409, code: "CONFLICT", reason: "LEADER_NOT_MEMBER", participantIds: notMembers };
  }
  const wanted = new Set(ids as string[]);
  const members = [...board.assignments].filter(([, assignment]) => assignment.groupId === groupId);
  const changed = members.filter(([participantId, assignment]) => assignment.leader !== wanted.has(participantId));
  if (changed.length > 0) {
    for (const [participantId, assignment] of changed) {
      assignment.leader = wanted.has(participantId);
      board.logs.push({ participantId, from: groupId, to: groupId, cause: "LEADER", actorId });
    }
    group.version += 1;
    board.version += 1;
  }
  const leaderIds = members.filter(([, assignment]) => assignment.leader).map(([participantId]) => participantId);
  return { group: { ...group }, leaderIds, boardVersion: board.version };
}

function readGate(eventId: string, actorId: string): GroupFailure | null {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if (!("status" in perms) && perms.effective.includes("GROUP_WRITE")) return null;
  const spaceRole = spacesFor(actorId).find((space) => space.spaceId === event.spaceId)?.role;
  if (spaceRole === "OWNER" || spaceRole === "ADMIN") return null;
  if ("status" in perms) return perms;
  return { status: 403, code: "FORBIDDEN" };
}

function writeGate(eventId: string, actorId: string): GroupFailure | null {
  if (!eventById(eventId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  if (!perms.effective.includes("GROUP_WRITE")) return { status: 403, code: "FORBIDDEN" };
  return null;
}

function stateGate(eventId: string): GroupFailure | null {
  const status = eventById(eventId)!.lifecycleStatus;
  if (status === "ENDED") return { status: 409, code: "EVENT_ENDED" };
  if (status === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  return null;
}

function readName(body: unknown): string | null {
  const raw = isRecord(body) ? body.name : undefined;
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length >= 1 && [...name].length <= NAME_MAX ? name : null;
}

function readChanges(body: unknown): { participantId: string; fromGroupId: string | null; toGroupId: string | null }[] | null {
  const raw = isRecord(body) ? body.changes : undefined;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > CHANGES_MAX) return null;
  const out: { participantId: string; fromGroupId: string | null; toGroupId: string | null }[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.participantId !== "string") return null;
    if (!("fromGroupId" in item) || !("toGroupId" in item)) return null;
    if (!isNullableString(item.fromGroupId) || !isNullableString(item.toGroupId)) return null;
    out.push({ participantId: item.participantId, fromGroupId: item.fromGroupId, toGroupId: item.toGroupId });
  }
  if (new Set(out.map((item) => item.participantId)).size !== out.length) return null;
  return out;
}

function boardOf(eventId: string): Board {
  let board = boards.get(eventId);
  if (!board) boards.set(eventId, (board = newBoard([])));
  return board;
}

function newBoard(people: Person[]): Board {
  return { version: 0, groups: [], assignments: new Map(), people, logs: [] };
}

/** Seeded people plus anyone who applied through the mock form (cohort only; other answers missing). */
function peopleOf(eventId: string): Person[] {
  const board = boardOf(eventId);
  for (const item of checkInCandidates(eventId)) {
    if (board.people.some((person) => person.participantId === item.participantId)) continue;
    board.people.push({
      participantId: item.participantId,
      name: item.name,
      cohort: item.cohort?.trim() || null,
      gender: null,
      attendance: "FULL",
      middleGroup: null,
      cell: null,
      submitted: true,
    });
  }
  return board.people;
}

function assignmentOf(board: Board, participantId: string): Assignment {
  return board.assignments.get(participantId) ?? { groupId: null, leader: false };
}

function field(name: string): GroupFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function seedPeople(): Person[] {
  const rows: [string, string | null, typeof MALE | null, Attendance, string | null, string | null][] = [
    ["김하늘", "94", FEMALE, "FULL", "청년1부", "다윗셀"],
    ["김하람", "95", MALE, "FULL", "청년1부", "다윗셀"],
    ["박서준", "96", MALE, "PARTIAL", "청년2부", "요셉셀"],
    ["이수아", "94", FEMALE, "FULL", "청년1부", "요셉셀"],
    ["이수아", "97", FEMALE, "WORSHIP_ONLY", "청년2부", null],
    ["정민호", null, MALE, "FULL", null, null],
    ["최예린", "98", FEMALE, "FULL", "청년2부", "에스더셀"],
    ["한지우", "95", null, "PARTIAL", "청년1부", "에스더셀"],
    ["오세훈", "96", MALE, "FULL", "청년2부", "요셉셀"],
    ["윤가은", "97", FEMALE, "FULL", "청년1부", "다윗셀"],
  ];
  return rows.map(([name, cohort, gender, attendance, middleGroup, cell], index) => ({
    participantId: `00000000-0000-4000-8000-0000000004${String(index).padStart(2, "0")}`,
    name,
    cohort,
    gender,
    attendance,
    middleGroup,
    cell,
    submitted: true,
  }));
}

function largePeople(count: number): Person[] {
  const family = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"];
  const given = ["하늘", "서준", "민지", "지우", "예린", "도윤", "수아", "하람", "시우", "가은", "주원", "유나", "건우", "채원"];
  const cells = ["다윗셀", "요셉셀", "에스더셀", "모세셀", "룻셀", "바울셀"];
  const out: Person[] = [];
  for (let index = 0; index < count; index += 1) {
    const cohortRoll = index % 13;
    out.push({
      participantId: `00000000-0000-4000-8000-${String(500000 + index).padStart(12, "0")}`,
      name: `${family[index % family.length]}${given[(index + Math.floor(index / family.length) * 3) % given.length]}`,
      cohort: cohortRoll === 12 ? null : String(90 + (index % 12)),
      gender: index % 11 === 10 ? null : index % 2 === 0 ? FEMALE : MALE,
      attendance: index % 9 === 0 ? "PARTIAL" : index % 17 === 0 ? "WORSHIP_ONLY" : "FULL",
      middleGroup: index % 10 === 9 ? null : `청년${(index % 3) + 1}부`,
      cell: index % 8 === 7 ? null : cells[index % cells.length],
      submitted: true,
    });
  }
  return out;
}
