import { localEvent, localUsers } from "./fixtures/seed";
import { eventById, spacesFor } from "./operatorStore";
import { requireEventRead } from "./formStore";
import { checkedInAtOf } from "./checkInStore";
import { notifyParticipants, type ParticipantNotificationDraft } from "./participantNotificationStore";
import { checkInCandidates, submittedApplicationIdOf } from "./participantStore";
import { groupRosterVisible } from "./participantSettingsStore";
import { publishedRoomOf } from "./participantRoomStore";
import { permissionsFor } from "./taskStore";

/** The 새가족 option label (DEC-070 Follow-up 2026-11-17). The board shows it as the middle group. */
const NEWCOMER_LABEL = "새가족 (등반X)";

/**
 * Shaped like GroupController (#299). Write order follows backend/docs/api.md "조 편성":
 * 404·403 NOT_A_MEMBER → 403 FORBIDDEN → 400 body → 409 event state → 404 target → 409 version·conflict
 * → 409 eligibility·rules → 200. Reads are not blocked by event state. Publishing (#300) keeps snapshots
 * of participant ids only, like `group_publications`; the participant "내 조" read and the 참가 현황 table's
 * group column read this store, so a publish here shows up on the participant screen (#302).
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
  newcomer: boolean | null;
  submitted: boolean;
  /** Chosen MEALS slots for PARTIAL·WORSHIP_ONLY; null is no answer ("모름"). FULL reads as every slot. */
  chosenSlots: string[] | null;
  /** 신청 전화 for the leader's member detail (DEC-083 §3); null when none. */
  phone?: string | null;
  /** When the current revision was saved; null while it is the first submission. */
  revisedAt?: string | null;
};

type Slot = { slotId: string; day: number; date: string; dayLabel: string; meal: string; label: string; sortOrder: number };

type GroupRow = { groupId: string; name: string; sortOrder: number; version: number };
/** `position` orders members within a group (#343): smaller first, not consecutive. */
type Assignment = { groupId: string | null; leader: boolean; position?: number };
type Log = { participantId: string; from: string | null; to: string | null; cause: "MOVE" | "LEADER" | "GROUP_DELETED"; actorId: string };

type PublishedGroup = { groupId: string; name: string; sortOrder: number; members: { participantId: string; leader: boolean }[] };
type Publication = {
  publicationId: string;
  publishedAt: string;
  publishedBy: string;
  boardVersion: number;
  groups: PublishedGroup[];
};

type Board = {
  version: number;
  groups: GroupRow[];
  assignments: Map<string, Assignment>;
  people: Person[];
  logs: Log[];
  publications: Publication[];
  /** 참석 칸 (#315); null when the form has no setup slots. */
  slots: Slot[] | null;
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
  unassignedCount?: number;
};

const NAME_MAX = 50;
const GROUPS_MAX = 100;
const CHANGES_MAX = 200;
const LEADERS_MAX = 1;
let nextPosition = 1_000_000;

const FEMALE = { optionId: "opt_female", label: "여" };
const MALE = { optionId: "opt_male", label: "남" };

let boards = new Map<string, Board>();
/** DEC-084: the group a withdraw removed, by `${eventId}:${participantId}`. */
const withdrawnFrom = new Map<string, string>();

export function resetGroupStore(): void {
  withdrawnFrom.clear();
  boards = new Map([[localEvent.eventId, newBoard(seedPeople(), retreatSlots())]]);
}
resetGroupStore();

/** Test and mock-click seam: a retreat-sized roster (`count` people, `groups` empty groups named 1조…). */
export function seedLargeGroupBoard(eventId: string, count: number, groups: number): void {
  const board = newBoard(largePeople(count), retreatSlots());
  for (let index = 0; index < groups; index += 1) {
    board.groups.push({ groupId: crypto.randomUUID(), name: `${index + 1}조`, sortOrder: index, version: 0 });
  }
  boards.set(eventId, board);
}

/** Test seam: the form has no setup slots (or none on any day), so the board sends `slots: null`. */
export function clearBoardSlots(eventId: string): void {
  boardOf(eventId).slots = null;
}

/** The 식사·집회 칸 of the board, for the schedule mock's `slots` (same ids as the server's MealSlots). */
export function boardSlotsOf(eventId: string): readonly Slot[] | null {
  return boardOf(eventId).slots;
}

/** Test seam: what one person chose in MEALS (null = no answer). */
export function setChosenSlots(eventId: string, participantId: string, slotIds: string[] | null): void {
  const person = peopleOf(eventId).find((item) => item.participantId === participantId);
  if (person) person.chosenSlots = slotIds;
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
  if (leader && groupId) {
    for (const assignment of board.assignments.values()) if (assignment.groupId === groupId) assignment.leader = false;
  }
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

/**
 * DEC-084 §4: a withdraw removes the working-copy assignment (the board version moves) and keeps the
 * group as "이전 조". Returns the removed group, or null when unassigned.
 */
export function withdrawFromBoard(eventId: string, participantId: string): { groupId: string; name: string; leader: boolean } | null {
  const board = boardOf(eventId);
  const person = board.people.find((item) => item.participantId === participantId);
  if (person) person.submitted = false;
  const removed = workingGroupOf(eventId, participantId);
  if (!removed) return null;
  board.assignments.delete(participantId);
  withdrawnFrom.set(`${eventId}:${participantId}`, removed.groupId);
  board.version += 1;
  return removed;
}

/** DEC-084 §3: back on the board, unassigned. Returns the previous group when it still exists. */
export function restoreToBoard(eventId: string, participantId: string): { groupId: string; name: string } | null {
  const board = boardOf(eventId);
  const person = board.people.find((item) => item.participantId === participantId);
  if (person) person.submitted = true;
  return previousGroupOf(eventId, participantId);
}

export function previousGroupOf(eventId: string, participantId: string): { groupId: string; name: string } | null {
  const groupId = withdrawnFrom.get(`${eventId}:${participantId}`);
  const group = groupId ? boardOf(eventId).groups.find((row) => row.groupId === groupId) : undefined;
  return group ? { groupId: group.groupId, name: group.name } : null;
}

/** Test seam: the application was withdrawn after the board was loaded. */
export function withdrawGroupParticipant(eventId: string, participantId: string): void {
  const person = peopleOf(eventId).find((item) => item.participantId === participantId);
  if (person) person.submitted = false;
}

export function groupPeople(eventId: string): readonly { participantId: string; name: string; cohort: string | null }[] {
  return peopleOf(eventId);
}

/**
 * What the room board mock (G3 #458) reads of each participant: answers, 참석 칸, the group of the latest group
 * publication and the working-copy group. Same people as the group board, active or not.
 */
export function roomBoardPeople(eventId: string): {
  participantId: string;
  name: string;
  cohort: string | null;
  gender: { optionId: string; label: string } | null;
  attendance: Attendance;
  submitted: boolean;
  slotIds: string[] | null;
  group: { groupId: string; name: string } | null;
  draftGroupId: string | null;
}[] {
  const board = boardOf(eventId);
  const latest = board.publications.at(-1) ?? null;
  const places = publishedPlaces(latest);
  return peopleOf(eventId).map((person) => {
    const place = places.get(person.participantId);
    const group = place ? latest!.groups.find((item) => item.groupId === place.groupId) : undefined;
    return {
      participantId: person.participantId,
      name: person.name,
      cohort: person.cohort,
      gender: person.gender,
      attendance: person.attendance,
      submitted: person.submitted,
      slotIds: slotIdsOf(board, person),
      group: group ? { groupId: group.groupId, name: group.name } : null,
      draftGroupId: assignmentOf(board, person.participantId).groupId,
    };
  });
}

/** The groups of the latest group publication, for the room board mock's `groups`. */
export function publishedGroupList(eventId: string): { groupId: string; name: string; sortOrder: number }[] {
  const latest = boardOf(eventId).publications.at(-1);
  return (latest?.groups ?? []).map((group) => ({ groupId: group.groupId, name: group.name, sortOrder: group.sortOrder }));
}

/** Test seam: the room mock's 200-person run seeds the group board too, so both read the same people. */
export function seedRoomRoster(eventId: string, count: number): void {
  boards.set(eventId, newBoard(largePeople(count), retreatSlots()));
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
  const latest = board.publications.at(-1) ?? null;
  const published = publishedPlaces(latest);
  const diff = differences(board, active, latest);
  return {
    eventStatus: eventById(eventId)!.lifecycleStatus,
    boardVersion: board.version,
    groups: [...board.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => ({ ...group })),
    participants: active.map((person) => {
      const assignment = assignmentOf(board, person.participantId);
      const place = published.get(person.participantId);
      return {
        participantId: person.participantId,
        applicationId: submittedApplicationIdOf(eventId, person.participantId),
        name: person.name,
        cohort: person.cohort,
        gender: person.gender,
        attendance: person.attendance,
        middleGroup: person.middleGroup,
        cell: person.cell,
        newcomer: person.newcomer,
        groupId: assignment.groupId,
        leader: assignment.leader,
        position: assignment.groupId === null ? null : positionOf(board, person.participantId),
        publishedGroupId: place?.groupId ?? null,
        publishedLeader: place?.leader ?? false,
        slotIds: slotIdsOf(board, person),
      };
    }),
    withdrawn: people
      .filter(
        (person) =>
          !person.submitted && (board.assignments.has(person.participantId) || withdrawnFrom.has(`${eventId}:${person.participantId}`)),
      )
      .map((person) => ({
        participantId: person.participantId,
        name: person.name,
        groupId: assignmentOf(board, person.participantId).groupId ?? withdrawnFrom.get(`${eventId}:${person.participantId}`) ?? null,
      })),
    publication: {
      lastPublishedAt: latest?.publishedAt ?? null,
      lastPublishedByDisplayName: latest ? displayName(latest.publishedBy) : null,
      lastPublishedBoardVersion: latest?.boardVersion ?? null,
      activeCount: active.length,
      assignedCount: assigned,
      unassignedCount: active.length - assigned,
      changedParticipantCount: diff.people,
      groupChanges: diff.groups,
      hasUnpublishedChanges: diff.people > 0 || diff.groups > 0,
    },
    slots: board.slots ? board.slots.map((slot) => ({ ...slot })) : null,
  };
}

/**
 * POST …/groups/publish (#300). After the gates and the body: event state → 409 CONCURRENT_MODIFICATION
 * (+boardVersion) → 200 ALREADY_PUBLISHED (only once published before) → 409 CONFIRMATION_REQUIRED
 * (+unassignedCount) → PUBLISHED. Publishing does not raise boardVersion.
 */
export function publish(eventId: string, actorId: string, body: unknown, now = new Date()) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const record = isRecord(body) ? body : {};
  if (!isCount(record.expectedBoardVersion)) return field("expectedBoardVersion");
  if (record.confirmUnassigned !== undefined && typeof record.confirmUnassigned !== "boolean") {
    return field("confirmUnassigned");
  }
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  if (board.version !== record.expectedBoardVersion) {
    return { status: 409, code: "CONCURRENT_MODIFICATION", boardVersion: board.version };
  }
  const active = activePeople(eventId);
  const assigned = active.filter((person) => assignmentOf(board, person.participantId).groupId !== null).length;
  const unassignedCount = active.length - assigned;
  const latest = board.publications.at(-1) ?? null;
  const diff = differences(board, active, latest);
  if (latest && diff.people === 0 && diff.groups === 0) {
    return {
      result: "ALREADY_PUBLISHED",
      publicationId: latest.publicationId,
      publishedAt: latest.publishedAt,
      boardVersion: board.version,
      assignedCount: assigned,
      unassignedCount,
      changedParticipantCount: 0,
    };
  }
  if (unassignedCount > 0 && record.confirmUnassigned !== true) {
    return { status: 409, code: "CONFIRMATION_REQUIRED", unassignedCount };
  }
  const activeIds = new Set(active.map((person) => person.participantId));
  const publication: Publication = {
    publicationId: crypto.randomUUID(),
    publishedAt: now.toISOString(),
    publishedBy: actorId,
    boardVersion: board.version,
    groups: [...board.groups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((group) => ({
        groupId: group.groupId,
        name: group.name,
        sortOrder: group.sortOrder,
        members: memberIds(board, group.groupId)
          .filter((participantId) => activeIds.has(participantId))
          .map((participantId) => ({ participantId, leader: assignmentOf(board, participantId).leader })),
      })),
  };
  board.publications.push(publication);
  notifyGroupChanges(eventId, latest, publication);
  return {
    result: "PUBLISHED",
    publicationId: publication.publicationId,
    publishedAt: publication.publishedAt,
    boardVersion: board.version,
    assignedCount: assigned,
    unassignedCount,
    changedParticipantCount: diff.people,
  };
}

/** `GROUP_PUBLISHED` for people whose group or leader mark changed (GroupService.notifyParticipants). */
function notifyGroupChanges(eventId: string, before: Publication | null, after: Publication): void {
  const was = publishedPlaces(before);
  const now = publishedPlaces(after);
  const names = new Map(after.groups.map((group) => [group.groupId, group.name]));
  const drafts = new Map<string, { draft: ParticipantNotificationDraft; ids: string[] }>();
  for (const person of activePeople(eventId)) {
    const from = was.get(person.participantId);
    const to = now.get(person.participantId);
    if ((from?.groupId ?? null) === (to?.groupId ?? null) && (from?.leader ?? false) === (to?.leader ?? false)) continue;
    const leader = to?.leader ?? false;
    const title = !to
      ? "조 배정이 바뀌었어요"
      : !from
        ? leader ? "내 조가 정해졌어요 · 조장" : "내 조가 정해졌어요"
        : from.groupId !== to.groupId
          ? leader ? "내 조가 바뀌었어요 · 조장" : "내 조가 바뀌었어요"
          : leader ? "조장으로 정해졌어요" : "조장 표시가 바뀌었어요";
    const draft: ParticipantNotificationDraft = {
      kind: "GROUP_PUBLISHED",
      target: { type: "GROUP", id: to?.groupId ?? null },
      title,
      body: to ? (names.get(to.groupId) ?? null) : "내 조 화면에서 확인해 주세요",
    };
    const key = JSON.stringify(draft);
    const entry = drafts.get(key) ?? { draft, ids: [] };
    entry.ids.push(person.participantId);
    drafts.set(key, entry);
  }
  for (const { draft, ids } of drafts.values()) notifyParticipants(eventId, ids, draft);
}

/** How many times the event's groups were published (`PUBLISHED` only), for the participant feed mock. */
export function publicationCount(eventId: string): number {
  return boardOf(eventId).publications.length;
}

type RosterMember = { name: string; cohort: string | null; gender: string | null; leader: boolean; me: boolean };

type LeaderMember = {
  participantId: string;
  name: string;
  cohort: string | null;
  gender: string | null;
  leader: boolean;
  checkIn: { checkedIn: boolean; checkedInAt: string | null };
  attendance: {
    type: Attendance;
    arrivalSlotId: string | null;
    departureSlotId: string | null;
    slotIds: string[] | null;
    lodgingNights: number[] | null;
  };
  room: { name: string; locationNote: string | null } | null;
  applicationRevisedAt: string | null;
};

export type ParticipantGroupBody = {
  status: "NOT_ELIGIBLE" | "NOT_PUBLISHED" | "UNASSIGNED" | "ASSIGNED";
  publishedAt: string | null;
  group: { name: string; leaders: { name: string }[] } | null;
  leader: boolean;
  rosterVisible: boolean;
  members: RosterMember[] | null;
  leaderView: { activeCount: number; checkedInCount: number; slots: Slot[] | null; members: LeaderMember[] } | null;
};

/**
 * GET /api/v1/participant/group (#300, DEC-072 §6, DEC-083 · #452) from the latest publication. Names, 또래
 * and 성별 are read now; withdrawn people drop out of the roster and the leader names. Members get the
 * roster while the event switch is on; the leader always gets it and `leaderView`. The server fills
 * `leaderView.members[].room` from the latest room publication (G2 #457); so does this mock (F4).
 */
export function readParticipantGroup(eventId: string, participantId: string): ParticipantGroupBody {
  const active = new Map(activePeople(eventId).map((person) => [person.participantId, person]));
  const none = { group: null, leader: false, rosterVisible: false, members: null, leaderView: null };
  if (!active.has(participantId)) return { status: "NOT_ELIGIBLE", publishedAt: null, ...none };
  const publication = boardOf(eventId).publications.at(-1);
  if (!publication) return { status: "NOT_PUBLISHED", publishedAt: null, ...none };
  const group = publication.groups.find((item) => item.members.some((member) => member.participantId === participantId));
  if (!group) return { status: "UNASSIGNED", publishedAt: publication.publishedAt, ...none };
  const people = group.members.flatMap((member) => {
    const person = active.get(member.participantId);
    return person ? [{ person, leader: member.leader }] : [];
  });
  const leader = people.some(({ person, leader: isLeader }) => person.participantId === participantId && isLeader);
  const rosterVisible = leader || groupRosterVisible(eventId);
  const board = boardOf(eventId);
  const leaderMembers = leader ? people.map(({ person, leader: isLeader }) => leaderMember(eventId, board, person, isLeader)) : [];
  return {
    status: "ASSIGNED",
    publishedAt: publication.publishedAt,
    group: { name: group.name, leaders: people.filter((item) => item.leader).map(({ person }) => ({ name: person.name })) },
    leader,
    rosterVisible,
    members: rosterVisible
      ? people.map(({ person, leader: isLeader }) => ({
          name: person.name,
          cohort: person.cohort,
          gender: person.gender?.label ?? null,
          leader: isLeader,
          me: person.participantId === participantId,
        }))
      : null,
    leaderView: leader
      ? {
          activeCount: leaderMembers.length,
          checkedInCount: leaderMembers.filter((member) => member.checkIn.checkedIn).length,
          slots: board.slots ? board.slots.map((slot) => ({ ...slot })) : null,
          members: leaderMembers,
        }
      : null,
  };
}

/**
 * GET /api/v1/participant/group/members/{participantId} (DEC-083 §3): only the leader of the latest
 * publication, for an active member of the same group (themself included). Everything else is the same
 * 404. Answers are a short made-up set with the operator table's reading text; the server logs each read.
 */
export function readGroupMember(eventId: string, viewerId: string, participantId: string) {
  const view = readParticipantGroup(eventId, viewerId);
  const member = view.leaderView?.members.find((item) => item.participantId === participantId);
  const person = activePeople(eventId).find((item) => item.participantId === participantId);
  if (!view.leader || !member || !person) return null;
  const answers = [
    ["COHORT", "또래", person.cohort],
    ["GENDER", "성별", person.gender?.label ?? null],
    ["MIDDLE_GROUP", "중그룹", person.middleGroup],
    ["CELL", "셀", person.cell],
    ["ATTENDANCE", "참석 방식", ATTENDANCE_TEXT[person.attendance]],
  ].flatMap(([presetKey, label, display]) =>
    display ? [{ fieldId: `field_${presetKey!.toLowerCase()}`, presetKey, label, type: "DROPDOWN", display, value: { text: display }, operatorEdited: false }] : [],
  );
  return {
    ...member,
    phone: person.phone ?? null,
    application: {
      submittedAt: "2026-12-16T03:00:00Z",
      revisedAt: person.revisedAt ?? null,
      revisedByOperator: false,
      answers,
    },
  };
}

const ATTENDANCE_TEXT: Record<Attendance, string> = { FULL: "전체 참석", PARTIAL: "부분 참석", WORSHIP_ONLY: "집회만 참석" };

function leaderMember(eventId: string, board: Board, person: Person, leader: boolean): LeaderMember {
  const checkedInAt = checkedInAtOf(eventId, person.participantId);
  const slotIds = slotIdsOf(board, person);
  return {
    participantId: person.participantId,
    name: person.name,
    cohort: person.cohort,
    gender: person.gender?.label ?? null,
    leader,
    checkIn: { checkedIn: checkedInAt !== null, checkedInAt },
    attendance: { type: person.attendance, arrivalSlotId: null, departureSlotId: null, slotIds, lodgingNights: lodgingNightsOf(board, person, slotIds) },
    room: publishedRoomOf(eventId, person.participantId),
    applicationRevisedAt: person.revisedAt ?? null,
  };
}

/** Rough stand-in for MealSlots.lodgingNights: a night n is slept when a slot on day n+1 follows one on day n. */
function lodgingNightsOf(board: Board, person: Person, slotIds: string[] | null): number[] | null {
  if (!board.slots) return null;
  if (person.attendance === "WORSHIP_ONLY") return [];
  if (!slotIds) return null;
  const days = [...new Set(board.slots.filter((slot) => slotIds.includes(slot.slotId)).map((slot) => slot.day))].sort();
  return days.filter((day) => days.includes(day + 1));
}

/**
 * GET …/groups/published (#288): the latest publication for EVENT_READ. Names and 또래 are read now;
 * withdrawn people drop out; active people outside every published group are `unassigned`.
 */
export function readPublishedGroups(eventId: string, actorId: string) {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate;
  const active = new Map(activePeople(eventId).map((person) => [person.participantId, person]));
  const publication = boardOf(eventId).publications.at(-1);
  if (!publication) return { publishedAt: null, groups: [], unassigned: [] };
  const placed = new Set<string>();
  const groups = [...publication.groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group) => {
      const members = group.members
        .flatMap((member) => {
          const person = active.get(member.participantId);
          if (!person) return [];
          placed.add(person.participantId);
          return [{ participantId: person.participantId, name: person.name, cohort: person.cohort, leader: member.leader }];
        })
        ;
      return {
        groupId: group.groupId,
        name: group.name,
        leaders: members.filter((member) => member.leader).map(({ participantId, name }) => ({ participantId, name })),
        members,
      };
    });
  const unassigned = [...active.values()]
    .filter((person) => !placed.has(person.participantId))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map(({ participantId, name, cohort }) => ({ participantId, name, cohort }));
  return { publishedAt: publication.publishedAt, groups, unassigned };
}

/** Working-copy group of one person, for the 참가 현황 table's group column (#308). */
export function workingGroupOf(eventId: string, participantId: string): { groupId: string; name: string; leader: boolean } | null {
  const board = boardOf(eventId);
  const assignment = assignmentOf(board, participantId);
  const group = board.groups.find((row) => row.groupId === assignment.groupId);
  return group ? { groupId: group.groupId, name: group.name, leader: assignment.leader } : null;
}

/** Seed seam (demo roster, tests): puts someone in a group, creating the group under that id if missing. */
export function seedAssignment(
  eventId: string,
  participantId: string,
  group: { groupId: string; name: string; leader: boolean } | null,
): void {
  const board = boardOf(eventId);
  if (group && !board.groups.some((row) => row.groupId === group.groupId)) {
    board.groups.push({ groupId: group.groupId, name: group.name, sortOrder: board.groups.length, version: 0 });
  }
  board.assignments.set(participantId, { groupId: group?.groupId ?? null, leader: Boolean(group?.leader) });
  board.version += 1;
}

/** Like the server's MealSlots: FULL is every slot; otherwise the chosen slots in `slots` order; null stays null. */
function slotIdsOf(board: Board, person: Person): string[] | null {
  if (!board.slots) return null;
  if (person.attendance === "FULL") return board.slots.map((slot) => slot.slotId);
  if (person.chosenSlots === null) return null;
  const chosen = new Set(person.chosenSlots);
  return board.slots.filter((slot) => chosen.has(slot.slotId)).map((slot) => slot.slotId);
}

/** A three-day retreat, 10 slots: 금 저녁·집회, 토와 일 아침·점심·저녁·집회. */
function retreatSlots(): Slot[] {
  const days = [
    { day: 1, date: "2027-01-22", dayLabel: "1월 22일 (금)", meals: ["DINNER", "WORSHIP"] },
    { day: 2, date: "2027-01-23", dayLabel: "1월 23일 (토)", meals: ["BREAKFAST", "LUNCH", "DINNER", "WORSHIP"] },
    { day: 3, date: "2027-01-24", dayLabel: "1월 24일 (일)", meals: ["BREAKFAST", "WORSHIP", "LUNCH", "DINNER"] },
  ];
  const labels: Record<string, string> = { BREAKFAST: "아침", LUNCH: "점심", DINNER: "저녁", WORSHIP: "집회" };
  const order = ["BREAKFAST", "LUNCH", "DINNER", "WORSHIP"];
  const slots: Slot[] = [];
  for (const day of days) {
    for (const meal of order.filter((item) => day.meals.includes(item))) {
      slots.push({
        slotId: `opt_d${day.day}_${meal === "WORSHIP" ? "worship" : meal.toLowerCase()}`,
        day: day.day,
        date: day.date,
        dayLabel: day.dayLabel,
        meal,
        label: labels[meal],
        sortOrder: slots.length,
      });
    }
  }
  return slots;
}

function activePeople(eventId: string): Person[] {
  return peopleOf(eventId).filter((person) => person.submitted);
}

function publishedPlaces(publication: Publication | null): Map<string, { groupId: string; leader: boolean }> {
  const places = new Map<string, { groupId: string; leader: boolean }>();
  for (const group of publication?.groups ?? []) {
    for (const member of group.members) places.set(member.participantId, { groupId: group.groupId, leader: member.leader });
  }
  return places;
}

/** Content comparison with the latest publication; before the first one, assigned people and all groups. */
function differences(board: Board, active: Person[], latest: Publication | null): { people: number; groups: number } {
  if (!latest) {
    return {
      people: active.filter((person) => assignmentOf(board, person.participantId).groupId !== null).length,
      groups: board.groups.length,
    };
  }
  const places = publishedPlaces(latest);
  const people = active.filter((person) => {
    const now = assignmentOf(board, person.participantId);
    const then = places.get(person.participantId) ?? { groupId: null, leader: false };
    return now.groupId !== then.groupId || now.leader !== then.leader;
  }).length;
  const ids = new Set([...board.groups.map((group) => group.groupId), ...latest.groups.map((group) => group.groupId)]);
  const groups = [...ids].filter((id) => {
    const now = board.groups.find((group) => group.groupId === id);
    const then = latest.groups.find((group) => group.groupId === id);
    if (!now || !then || now.name !== then.name || now.sortOrder !== then.sortOrder) return true;
    // Member order counts too (#343): the people on both sides, compared in order.
    const activeIds = new Set(active.map((person) => person.participantId));
    const working = memberIds(board, id).filter((pid) => activeIds.has(pid));
    const published = then.members.map((member) => member.participantId);
    const left = working.filter((pid) => published.includes(pid));
    const right = published.filter((pid) => working.includes(pid));
    return left.join() !== right.join();
  }).length;
  return { people, groups };
}

function displayName(userId: string): string {
  return localUsers.find((user) => user.userId === userId)?.displayName ?? "운영자";
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
    board.assignments.set(change.participantId, { groupId: change.toGroupId, leader: false, position: nextPosition++ });
  }
  const targets = new Set(movers.flatMap((change) => (change.toGroupId === null ? [] : [change.toGroupId])));
  for (const groupId of targets) {
    const arriving = movers.filter((change) => change.toGroupId === groupId);
    const arrivingIds = new Set(arriving.map((change) => change.participantId));
    const order = memberIds(board, groupId).filter((id) => !arrivingIds.has(id));
    for (const change of arriving) {
      const anchor = change.beforeParticipantId ? order.indexOf(change.beforeParticipantId) : -1;
      if (anchor < 0) order.push(change.participantId);
      else order.splice(anchor, 0, change.participantId);
    }
    order.forEach((id, index) => (board.assignments.get(id)!.position = index));
  }
  for (const change of movers) {
    board.logs.push({ participantId: change.participantId, from: change.fromGroupId, to: change.toGroupId, cause: "MOVE", actorId });
  }
  if (movers.length > 0) board.version += 1;
  return { changed: movers.length, alreadyApplied, boardVersion: board.version };
}

/** PUT …/groups/{groupId}/members/order (#343): every active member once, or 409 with conflicts and nothing saved. */
export function reorderMembers(eventId: string, groupId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const ids = isRecord(body) ? body.participantIds : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string") || new Set(ids).size !== ids.length) {
    return field("participantIds");
  }
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  if (!board.groups.some((group) => group.groupId === groupId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const people = peopleOf(eventId);
  const submitted = (id: string) => people.find((person) => person.participantId === id)?.submitted ?? false;
  const all = memberIds(board, groupId);
  const active = all.filter(submitted);
  const conflicts = [
    ...(ids as string[])
      .filter((id) => !active.includes(id))
      .map((id) => ({ participantId: id, currentGroupId: assignmentOf(board, id).groupId })),
    ...active.filter((id) => !ids.includes(id)).map((id) => ({ participantId: id, currentGroupId: groupId })),
  ];
  if (conflicts.length > 0) return { status: 409, code: "CONCURRENT_MODIFICATION", conflicts, boardVersion: board.version };
  const next = [...(ids as string[]), ...all.filter((id) => !submitted(id))];
  if (next.join() === all.join()) return { boardVersion: board.version };
  next.forEach((id, index) => (board.assignments.get(id)!.position = index));
  board.version += 1;
  return { boardVersion: board.version };
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
    // Clear the old leader first (one leader per group, #343).
    changed.sort(([, a], [, b]) => Number(b.leader) - Number(a.leader));
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

type Change = { participantId: string; fromGroupId: string | null; toGroupId: string | null; beforeParticipantId: string | null };

function readChanges(body: unknown): Change[] | null {
  const raw = isRecord(body) ? body.changes : undefined;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > CHANGES_MAX) return null;
  const out: Change[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.participantId !== "string") return null;
    if (!("fromGroupId" in item) || !("toGroupId" in item)) return null;
    if (!isNullableString(item.fromGroupId) || !isNullableString(item.toGroupId)) return null;
    const before = item.beforeParticipantId ?? null;
    if (!isNullableString(before)) return null;
    out.push({ participantId: item.participantId, fromGroupId: item.fromGroupId, toGroupId: item.toGroupId, beforeParticipantId: before });
  }
  if (new Set(out.map((item) => item.participantId)).size !== out.length) return null;
  return out;
}

function boardOf(eventId: string): Board {
  let board = boards.get(eventId);
  if (!board) boards.set(eventId, (board = newBoard([])));
  return board;
}

function newBoard(people: Person[], slots: Slot[] | null = null): Board {
  return { version: 0, groups: [], assignments: new Map(), people, logs: [], publications: [], slots };
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
      newcomer: null,
      submitted: true,
      chosenSlots: null,
    });
  }
  return board.people;
}

/** Member ids of a group in order: position, then participantId (rows without a position keep insertion order). */
function memberIds(board: Board, groupId: string): string[] {
  return [...board.assignments]
    .filter(([, assignment]) => assignment.groupId === groupId)
    .map(([participantId]) => ({ participantId, position: positionOf(board, participantId) }))
    .sort((a, b) => a.position - b.position || a.participantId.localeCompare(b.participantId))
    .map((item) => item.participantId);
}

/** Rows set without a position (seeds, test seams) go to the end in the order they are first read. */
function positionOf(board: Board, participantId: string): number {
  const assignment = board.assignments.get(participantId);
  if (!assignment) return 0;
  if (assignment.position === undefined) assignment.position = nextPosition++;
  return assignment.position;
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
  // 새가족 (등반X) chosen as middle group: 박서준·윤가은. 정민호 has no answer, others a listed group.
  const newcomers: Record<number, boolean | null> = { 2: true, 9: true, 5: null };
  return rows.map(([name, cohort, gender, attendance, middleGroup, cell], index) => ({
    participantId: `00000000-0000-4000-8000-0000000004${String(index).padStart(2, "0")}`,
    name,
    cohort,
    gender,
    attendance,
    middleGroup: newcomers[index] === true ? NEWCOMER_LABEL : middleGroup,
    cell: newcomers[index] === true ? null : cell,
    newcomer: index in newcomers ? newcomers[index] : false,
    submitted: true,
    phone: index === 5 ? null : `010-2${String(index).padStart(3, "0")}-${String(4000 + index * 7)}`,
    revisedAt: index === 2 ? "2026-12-28T10:00:00Z" : null,
    // 박서준: 토요일 저녁부터 끝까지. 이수아(97): 집회만. 한지우: 부분 참석인데 칸 답 없음(모름).
    chosenSlots:
      index === 2
        ? ["opt_d2_dinner", "opt_d2_worship", "opt_d3_breakfast", "opt_d3_lunch", "opt_d3_worship"]
        : index === 4
          ? ["opt_d1_worship", "opt_d2_worship", "opt_d3_worship"]
          : null,
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
      cohort: cohortRoll === 12 ? null : String((90 + (index % 12)) % 100).padStart(2, "0"),
      gender: index % 11 === 10 ? null : index % 2 === 0 ? FEMALE : MALE,
      attendance: index % 9 === 0 ? "PARTIAL" : index % 17 === 0 ? "WORSHIP_ONLY" : "FULL",
      middleGroup: index % 10 === 9 ? null : index % 7 === 3 ? NEWCOMER_LABEL : `청년${(index % 3) + 1}부`,
      cell: index % 8 === 7 || index % 7 === 3 ? null : cells[index % cells.length],
      newcomer: index % 10 === 9 ? null : index % 7 === 3,
      submitted: true,
      phone: `010-3${String(index).padStart(3, "0")}-${String(5000 + index).slice(-4)}`,
      chosenSlots: largeChosenSlots(index),
    });
  }
  return out;
}

/** PARTIAL people come late, leave early or skip a day; WORSHIP_ONLY take the worships; every 5th has no answer. */
function largeChosenSlots(index: number): string[] | null {
  if (index % 45 === 0) return null;
  const all = retreatSlots().map((slot) => slot.slotId);
  if (index % 9 !== 0) return all.filter((id) => id.endsWith("worship"));
  const shape = Math.floor(index / 9) % 4;
  if (shape === 0) return all.slice(2);
  if (shape === 1) return all.slice(0, 6);
  if (shape === 2) return [...all.slice(0, 2), ...all.slice(6)];
  return all.slice(3, 8);
}
