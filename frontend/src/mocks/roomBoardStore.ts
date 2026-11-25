import { localUsers } from "./fixtures/seed";
import { boardSlotsOf, publishedGroupList, roomBoardPeople } from "./groupStore";
import { eventById, spacesFor } from "./operatorStore";
import { publishParticipantRooms, setNotLodging } from "./participantRoomStore";
import { permissionsFor } from "./taskStore";

/**
 * Shaped like RoomController (G2 #457) for the operator room screen (G3 #458) and "다시 볼 것" (A11 #461). Order follows
 * backend/docs/api.md "숙소": 404·403 → 403 FORBIDDEN → 400 body → 409 event state → 404 target → 409 version·conflict
 * → 409 rules → 200. People come from the group board mock (`roomBoardPeople`) so the 조 column and 조 단위 일괄 배정
 * read the same groups. Lodging is a simplified MealSlots rule: FULL sleeps every night, 집회만 none, PARTIAL the nights
 * between two attended days, and a PARTIAL person with no slot answer is 모름. A publication is handed to the participant
 * view (G4 `participantRoomStore`), which raises `updates.rooms` like the server.
 */
type Lodging = "LODGING" | "NOT_LODGING" | "UNKNOWN";

type RoomRow = {
  roomId: string;
  name: string;
  locationNote: string | null;
  capacity: number | null;
  genderOptionId: string | null;
  sortOrder: number;
  version: number;
};

type Basis = { genderOptionId: string | null; lodgingNights: number[] | null; slotIds: string[] | null; at: string };

type Publication = {
  publicationId: string;
  publishedAt: string;
  publishedBy: string;
  boardVersion: number;
  rooms: (Omit<RoomRow, "version"> & { memberIds: string[] })[];
};

type Board = {
  version: number;
  rooms: RoomRow[];
  assignments: Map<string, { roomId: string; basis: Basis }>;
  publications: Publication[];
  logs: { participantId: string; from: string | null; to: string | null; cause: "MOVE" | "ROOM_DELETED" }[];
};

type Person = ReturnType<typeof roomBoardPeople>[number] & { lodging: Lodging; lodgingNights: number[] | null; genderShown: string | null };

export type RoomFailure = {
  status: number;
  code: string;
  errors?: { field: string }[];
  version?: number;
  boardVersion?: number;
  conflicts?: { participantId: string; currentRoomId: string | null }[];
  reason?: string;
  participantIds?: string[];
  unassignedCount?: number;
  notLodgingAssignedCount?: number;
};

const NAME_MAX = 50;
const NOTE_MAX = 100;
const CAPACITY_MAX = 50;
const ROOMS_MAX = 200;
const CHANGES_MAX = 200;
const GENDER_OPTIONS = ["opt_male", "opt_female"];
const GENDER_LABELS: Record<string, string> = { opt_male: "남", opt_female: "여" };

let boards = new Map<string, Board>();
/** A4 edits after assignment (test and click seam): nights and gender that override the answers. */
let edits = new Map<string, { lodgingNights?: number[] | null; gender?: { optionId: string; label: string } | null; slotIds?: string[] | null }>();

export function resetRoomBoardStore(): void {
  boards = new Map();
  edits = new Map();
}
resetRoomBoardStore();

/** Seed seam: `rooms` empty rooms named 301호… with a capacity and alternating 남·여 split. */
export function seedRooms(eventId: string, rooms: number, capacity: number | null = 6): string[] {
  const board = boardOf(eventId);
  const ids: string[] = [];
  for (let index = 0; index < rooms; index += 1) {
    const roomId = crypto.randomUUID();
    board.rooms.push({
      roomId,
      name: `${301 + index}호`,
      locationNote: index % 2 === 0 ? "본관 3층" : "별관 2층",
      capacity,
      genderOptionId: GENDER_OPTIONS[index % 2],
      sortOrder: board.rooms.length,
      version: 0,
    });
    ids.push(roomId);
  }
  board.version += 1;
  return ids;
}

/** Test seam: another operator put someone in a room (basis = their values now). */
export function placeAsOtherOperator(eventId: string, participantId: string, roomId: string | null): void {
  const board = boardOf(eventId);
  const person = people(eventId).find((item) => item.participantId === participantId);
  if (!person) return;
  if (roomId === null) board.assignments.delete(participantId);
  else board.assignments.set(participantId, { roomId, basis: basisOf(person) });
  board.version += 1;
}

/** Test and click seam for A4: the participant edited their application after being placed. */
export function editApplication(
  eventId: string,
  participantId: string,
  change: { lodgingNights?: number[] | null; gender?: { optionId: string; label: string } | null; slotIds?: string[] | null },
): void {
  const key = `${eventId}:${participantId}`;
  edits.set(key, { ...edits.get(key), ...change });
}

export function roomOf(eventId: string, participantId: string): string | null {
  return boardOf(eventId).assignments.get(participantId)?.roomId ?? null;
}

export function roomPublications(eventId: string): readonly Publication[] {
  return boardOf(eventId).publications;
}

export function readRoomBoard(eventId: string, actorId: string) {
  const gate = readGate(eventId, actorId);
  if (gate) return gate;
  const board = boardOf(eventId);
  const all = people(eventId);
  const active = all.filter((person) => person.submitted);
  const latest = board.publications.at(-1) ?? null;
  const published = placements(latest);
  const drafts = hasPermission(eventId, actorId, "GROUP_WRITE");
  const counts = countsOf(board, active);
  const diff = differences(board, active, latest);
  return {
    eventStatus: eventById(eventId)!.lifecycleStatus,
    boardVersion: board.version,
    rooms: sortedRooms(board).map((room) => boardRoom(room, board, active)),
    participants: active.map((person) => {
      const assignment = board.assignments.get(person.participantId);
      return {
        participantId: person.participantId,
        name: person.name,
        cohort: person.cohort,
        gender: person.gender,
        attendance: person.attendance,
        slotIds: person.slotIds,
        lodging: person.lodging,
        lodgingNights: person.lodgingNights,
        group: person.group,
        draftGroupId: drafts ? person.draftGroupId : null,
        roomId: assignment?.roomId ?? null,
        publishedRoomId: published.get(person.participantId) ?? null,
        review: assignment ? review(person, assignment.basis) : null,
      };
    }),
    withdrawn: all
      .filter((person) => !person.submitted && board.assignments.has(person.participantId))
      .map((person) => ({ participantId: person.participantId, name: person.name, roomId: board.assignments.get(person.participantId)!.roomId })),
    publication: {
      lastPublishedAt: latest?.publishedAt ?? null,
      lastPublishedByDisplayName: latest ? displayName(latest.publishedBy) : null,
      lastPublishedBoardVersion: latest?.boardVersion ?? null,
      activeCount: active.length,
      ...counts,
      changedParticipantCount: diff.people,
      roomChanges: diff.rooms,
      hasUnpublishedChanges: diff.people > 0 || diff.rooms > 0,
    },
    groups: publishedGroupList(eventId),
    slots: boardSlotsOf(eventId)?.map((slot) => ({ ...slot })) ?? null,
  };
}

export function createRoom(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const record = isRecord(body) ? body : {};
  const fields = readFields(record, true);
  if ("status" in fields) return fields;
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  if (board.rooms.length >= ROOMS_MAX) return { status: 409, code: "CONFLICT", reason: "ROOM_LIMIT" };
  if (board.rooms.some((room) => room.name === fields.name)) return { status: 409, code: "CONFLICT" };
  const room: RoomRow = {
    roomId: crypto.randomUUID(),
    name: fields.name!,
    locationNote: fields.locationNote ?? null,
    capacity: fields.capacity ?? null,
    genderOptionId: fields.genderOptionId ?? null,
    sortOrder: board.rooms.length,
    version: 0,
  };
  board.rooms.push(room);
  board.version += 1;
  return { room: boardRoom(room, board, activePeople(eventId)), boardVersion: board.version };
}

export function updateRoom(eventId: string, roomId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const record = isRecord(body) ? body : {};
  const fields = readFields(record, false);
  if ("status" in fields) return fields;
  if (!isCount(record.expectedVersion)) return field("expectedVersion");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const room = board.rooms.find((item) => item.roomId === roomId);
  if (!room) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (room.version !== record.expectedVersion) return { status: 409, code: "CONCURRENT_MODIFICATION", version: room.version };
  const next = {
    name: fields.name ?? room.name,
    locationNote: "locationNote" in record ? (fields.locationNote ?? null) : room.locationNote,
    capacity: "capacity" in record ? (fields.capacity ?? null) : room.capacity,
    genderOptionId: "genderOptionId" in record ? (fields.genderOptionId ?? null) : room.genderOptionId,
  };
  const same =
    next.name === room.name &&
    next.locationNote === room.locationNote &&
    next.capacity === room.capacity &&
    next.genderOptionId === room.genderOptionId;
  if (!same) {
    if (next.name !== room.name && board.rooms.some((item) => item.name === next.name)) return { status: 409, code: "CONFLICT" };
    Object.assign(room, next);
    room.version += 1;
    board.version += 1;
  }
  return { room: boardRoom(room, board, activePeople(eventId)), boardVersion: board.version };
}

export function deleteRoom(eventId: string, roomId: string, actorId: string, url: URL) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const raw = url.searchParams.get("expectedVersion");
  if (raw === null || !/^\d{1,9}$/.test(raw)) return field("expectedVersion");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const room = board.rooms.find((item) => item.roomId === roomId);
  if (!room) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (room.version !== Number(raw)) return { status: 409, code: "CONCURRENT_MODIFICATION", version: room.version };
  let unassignedCount = 0;
  for (const [participantId, assignment] of [...board.assignments]) {
    if (assignment.roomId !== roomId) continue;
    board.assignments.delete(participantId);
    board.logs.push({ participantId, from: roomId, to: null, cause: "ROOM_DELETED" });
    unassignedCount += 1;
  }
  board.rooms = board.rooms.filter((item) => item.roomId !== roomId);
  board.version += 1;
  return { unassignedCount, boardVersion: board.version };
}

export function reorderRooms(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const ids = isRecord(body) ? body.roomIds : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return field("roomIds");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const current = sortedRooms(board);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.some((room) => room.roomId === id))) {
    return { status: 409, code: "CONFLICT" };
  }
  if (ids.some((id, index) => current[index].roomId !== id)) {
    ids.forEach((id, index) => {
      board.rooms.find((room) => room.roomId === id)!.sortOrder = index;
    });
    board.version += 1;
  }
  return { boardVersion: board.version };
}

export function assignRooms(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const changes = readChanges(body);
  if (!changes) return field("changes");
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const all = new Map(people(eventId).map((person) => [person.participantId, person]));
  if (changes.some((change) => !all.has(change.participantId))) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (changes.some((change) => change.toRoomId !== null && !board.rooms.some((room) => room.roomId === change.toRoomId))) {
    return { status: 404, code: "RESOURCE_NOT_FOUND" };
  }
  const conflicts: { participantId: string; currentRoomId: string | null }[] = [];
  const moves: typeof changes = [];
  let alreadyApplied = 0;
  for (const change of changes) {
    const current = board.assignments.get(change.participantId)?.roomId ?? null;
    if (current === change.toRoomId) alreadyApplied += 1;
    else if (current === change.fromRoomId) moves.push(change);
    else conflicts.push({ participantId: change.participantId, currentRoomId: current });
  }
  if (conflicts.length > 0) return { status: 409, code: "CONCURRENT_MODIFICATION", conflicts, boardVersion: board.version };
  const notActive = moves.filter((change) => change.toRoomId !== null && !all.get(change.participantId)!.submitted);
  if (notActive.length > 0) {
    return { status: 409, code: "INVALID_STATE_TRANSITION", reason: "APPLICATION_NOT_SUBMITTED", participantIds: notActive.map((c) => c.participantId) };
  }
  const notLodging = moves.filter((change) => change.toRoomId !== null && all.get(change.participantId)!.lodging === "NOT_LODGING");
  if (notLodging.length > 0) {
    return { status: 409, code: "INVALID_STATE_TRANSITION", reason: "NOT_LODGING", participantIds: notLodging.map((c) => c.participantId) };
  }
  if (moves.length === 0) return { changed: 0, alreadyApplied, boardVersion: board.version, rooms: [] };
  const touched = new Set<string>();
  for (const change of moves) {
    const before = board.assignments.get(change.participantId)?.roomId ?? null;
    if (change.toRoomId === null) board.assignments.delete(change.participantId);
    else board.assignments.set(change.participantId, { roomId: change.toRoomId, basis: basisOf(all.get(change.participantId)!) });
    board.logs.push({ participantId: change.participantId, from: before, to: change.toRoomId, cause: "MOVE" });
    if (before) touched.add(before);
    if (change.toRoomId) touched.add(change.toRoomId);
  }
  board.version += 1;
  const active = activePeople(eventId);
  return {
    changed: moves.length,
    alreadyApplied,
    boardVersion: board.version,
    rooms: sortedRooms(board)
      .filter((room) => touched.has(room.roomId))
      .map((room) => {
        const full = boardRoom(room, board, active);
        return { roomId: room.roomId, memberCount: full.memberCount, warnings: full.warnings };
      }),
  };
}

export function confirmReview(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const ids = isRecord(body) ? body.participantIds : undefined;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > CHANGES_MAX || !ids.every((id) => typeof id === "string") || new Set(ids).size !== ids.length) {
    return field("participantIds");
  }
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const all = new Map(people(eventId).map((person) => [person.participantId, person]));
  if (ids.some((id) => !all.has(id as string))) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  let confirmed = 0;
  let unchanged = 0;
  let notAssigned = 0;
  for (const id of ids as string[]) {
    const person = all.get(id)!;
    const assignment = board.assignments.get(id);
    if (!person.submitted || !assignment) notAssigned += 1;
    else if (!review(person, assignment.basis)) unchanged += 1;
    else {
      assignment.basis = basisOf(person);
      confirmed += 1;
    }
  }
  return { confirmed, unchanged, notAssigned, boardVersion: board.version };
}

export function publishRooms(eventId: string, actorId: string, body: unknown, now = new Date()) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const record = isRecord(body) ? body : {};
  if (!isCount(record.expectedBoardVersion)) return field("expectedBoardVersion");
  for (const key of ["confirmUnassigned", "confirmNotLodging", "notify"]) {
    if (record[key] !== undefined && record[key] !== null && typeof record[key] !== "boolean") return field(key);
  }
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  if (board.version !== record.expectedBoardVersion) return { status: 409, code: "CONCURRENT_MODIFICATION", boardVersion: board.version };
  const active = activePeople(eventId);
  const counts = countsOf(board, active);
  const latest = board.publications.at(-1) ?? null;
  const diff = differences(board, active, latest);
  const warned = sortedRooms(board).filter((room) => boardRoom(room, board, active).warnings.length > 0).length;
  if (latest && diff.people === 0 && diff.rooms === 0) {
    return {
      result: "ALREADY_PUBLISHED",
      publicationId: latest.publicationId,
      publishedAt: latest.publishedAt,
      boardVersion: board.version,
      assignedCount: counts.assignedCount,
      unassignedCount: counts.unassignedCount,
      notLodgingAssignedCount: counts.notLodgingAssignedCount,
      changedParticipantCount: 0,
      roomsWithWarnings: warned,
      notifiedCount: 0,
    };
  }
  if ((counts.unassignedCount > 0 && record.confirmUnassigned !== true) || (counts.notLodgingAssignedCount > 0 && record.confirmNotLodging !== true)) {
    return {
      status: 409,
      code: "CONFIRMATION_REQUIRED",
      unassignedCount: counts.unassignedCount,
      notLodgingAssignedCount: counts.notLodgingAssignedCount,
    };
  }
  const activeIds = new Set(active.map((person) => person.participantId));
  const before = placements(latest);
  const publication: Publication = {
    publicationId: crypto.randomUUID(),
    publishedAt: now.toISOString(),
    publishedBy: actorId,
    boardVersion: board.version,
    rooms: sortedRooms(board).map((room) => ({
      roomId: room.roomId,
      name: room.name,
      locationNote: room.locationNote,
      capacity: room.capacity,
      genderOptionId: room.genderOptionId,
      sortOrder: room.sortOrder,
      memberIds: [...board.assignments].filter(([id, a]) => a.roomId === room.roomId && activeIds.has(id)).map(([id]) => id),
    })),
  };
  board.publications.push(publication);
  shareWithParticipants(eventId, publication, active, now);
  const after = placements(publication);
  const notified = record.notify === false ? 0 : active.filter((person) => (latest ? before.get(person.participantId) !== after.get(person.participantId) : after.has(person.participantId))).length;
  return {
    result: "PUBLISHED",
    publicationId: publication.publicationId,
    publishedAt: publication.publishedAt,
    boardVersion: board.version,
    assignedCount: counts.assignedCount,
    unassignedCount: counts.unassignedCount,
    notLodgingAssignedCount: counts.notLodgingAssignedCount,
    changedParticipantCount: diff.people,
    roomsWithWarnings: warned,
    notifiedCount: notified,
  };
}

/** The participant read (GET /participant/rooms) sees what was just published, like the server's snapshot. */
function shareWithParticipants(eventId: string, publication: Publication, active: Person[], now: Date): void {
  const byId = new Map(active.map((person) => [person.participantId, person]));
  publishParticipantRooms(
    eventId,
    publication.rooms.map((room) => ({
      roomId: room.roomId,
      name: room.name,
      locationNote: room.locationNote,
      genderLabel: room.genderOptionId ? (GENDER_LABELS[room.genderOptionId] ?? null) : null,
      members: room.memberIds.map((id) => {
        const person = byId.get(id)!;
        return { participantId: id, name: person.name, cohort: person.cohort, gender: person.gender?.label ?? null };
      }),
    })),
    now,
  );
  for (const person of active) setNotLodging(eventId, person.participantId, person.lodging === "NOT_LODGING");
}

// ---- rules ----

function people(eventId: string): Person[] {
  return roomBoardPeople(eventId)
    .map((row) => {
      const edit = edits.get(`${eventId}:${row.participantId}`) ?? {};
      const gender = edit.gender !== undefined ? edit.gender : row.gender;
      const slotIds = edit.slotIds !== undefined ? edit.slotIds : row.slotIds;
      const nights = edit.lodgingNights !== undefined ? edit.lodgingNights : lodgingNights(row.attendance, slotIds);
      return {
        ...row,
        gender,
        slotIds,
        lodgingNights: nights,
        lodging: (nights === null ? "UNKNOWN" : nights.length === 0 ? "NOT_LODGING" : "LODGING") as Lodging,
        genderShown: gender?.optionId ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.participantId.localeCompare(b.participantId));
}

function activePeople(eventId: string): Person[] {
  return people(eventId).filter((person) => person.submitted);
}

/** Two nights (fri→sat, sat→sun) like the group mock's retreat slots. */
function lodgingNights(attendance: string, slotIds: string[] | null): number[] | null {
  if (attendance === "FULL") return [1, 2];
  if (attendance === "WORSHIP_ONLY") return [];
  if (slotIds === null) return null;
  const days = new Set(slotIds.map((id) => Number(/^opt_d(\d+)_/.exec(id)?.[1] ?? 0)));
  return [1, 2].filter((night) => days.has(night) && days.has(night + 1));
}

function basisOf(person: Person): Basis {
  return { genderOptionId: person.genderShown, lodgingNights: person.lodgingNights, slotIds: person.slotIds, at: new Date().toISOString() };
}

function review(person: Person, basis: Basis): { reasons: string[]; assignedAt: string } | null {
  const reasons: string[] = [];
  if (JSON.stringify(basis.lodgingNights) !== JSON.stringify(person.lodgingNights)) {
    reasons.push(person.lodging === "NOT_LODGING" ? "NOT_LODGING" : "LODGING_CHANGED");
  }
  const set = (ids: string[] | null) => (ids === null ? "null" : [...ids].sort().join());
  if (set(basis.slotIds) !== set(person.slotIds)) reasons.push("ATTENDANCE_CHANGED");
  if (basis.genderOptionId !== person.genderShown) reasons.push("GENDER_CHANGED");
  return reasons.length > 0 ? { reasons, assignedAt: basis.at } : null;
}

function boardRoom(room: RoomRow, board: Board, active: Person[]) {
  const members = active.filter((person) => board.assignments.get(person.participantId)?.roomId === room.roomId);
  const warnings: { code: string; count?: number; capacity?: number; participantIds?: string[] }[] = [];
  if (room.capacity !== null && members.length > room.capacity) warnings.push({ code: "OVER_CAPACITY", count: members.length, capacity: room.capacity });
  if (room.genderOptionId !== null) {
    const mismatch = members.filter((person) => person.genderShown !== null && person.genderShown !== room.genderOptionId);
    const unknown = members.filter((person) => person.genderShown === null);
    if (mismatch.length > 0) warnings.push({ code: "GENDER_MISMATCH", participantIds: mismatch.map((person) => person.participantId) });
    if (unknown.length > 0) warnings.push({ code: "GENDER_UNKNOWN", participantIds: unknown.map((person) => person.participantId) });
  }
  const notLodging = members.filter((person) => person.lodging === "NOT_LODGING");
  if (notLodging.length > 0) warnings.push({ code: "NOT_LODGING", participantIds: notLodging.map((person) => person.participantId) });
  return {
    roomId: room.roomId,
    name: room.name,
    locationNote: room.locationNote,
    capacity: room.capacity,
    gender: room.genderOptionId ? { optionId: room.genderOptionId, label: GENDER_LABELS[room.genderOptionId] ?? null } : null,
    sortOrder: room.sortOrder,
    version: room.version,
    memberCount: members.length,
    warnings,
  };
}

function countsOf(board: Board, active: Person[]) {
  let eligibleCount = 0;
  let assignedCount = 0;
  let unassignedCount = 0;
  let notLodgingAssignedCount = 0;
  for (const person of active) {
    const placed = board.assignments.has(person.participantId);
    if (placed) assignedCount += 1;
    if (person.lodging !== "NOT_LODGING") {
      eligibleCount += 1;
      if (!placed) unassignedCount += 1;
    } else if (placed) notLodgingAssignedCount += 1;
  }
  return { eligibleCount, assignedCount, unassignedCount, notLodgingAssignedCount };
}

function placements(publication: Publication | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const room of publication?.rooms ?? []) for (const id of room.memberIds) map.set(id, room.roomId);
  return map;
}

function differences(board: Board, active: Person[], latest: Publication | null): { people: number; rooms: number } {
  const published = placements(latest);
  const changed = active.filter((person) => (board.assignments.get(person.participantId)?.roomId ?? null) !== (published.get(person.participantId) ?? null)).length;
  const then = new Map((latest?.rooms ?? []).map((room) => [room.roomId, room]));
  let rooms = 0;
  for (const room of board.rooms) {
    const old = then.get(room.roomId);
    if (
      !old ||
      old.name !== room.name ||
      old.locationNote !== room.locationNote ||
      old.capacity !== room.capacity ||
      old.genderOptionId !== room.genderOptionId ||
      old.sortOrder !== room.sortOrder
    ) {
      rooms += 1;
    }
    then.delete(room.roomId);
  }
  return { people: changed, rooms: rooms + then.size };
}

function sortedRooms(board: Board): RoomRow[] {
  return [...board.rooms].sort((a, b) => a.sortOrder - b.sortOrder || a.roomId.localeCompare(b.roomId));
}

type Change = { participantId: string; fromRoomId: string | null; toRoomId: string | null };

function readChanges(body: unknown): Change[] | null {
  const raw = isRecord(body) ? body.changes : undefined;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > CHANGES_MAX) return null;
  const out: Change[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.participantId !== "string" || !("fromRoomId" in item) || !("toRoomId" in item) || "night" in item) return null;
    if (!isNullableString(item.fromRoomId) || !isNullableString(item.toRoomId)) return null;
    out.push({ participantId: item.participantId, fromRoomId: item.fromRoomId, toRoomId: item.toRoomId });
  }
  return new Set(out.map((item) => item.participantId)).size === out.length ? out : null;
}

function readFields(record: Record<string, unknown>, create: boolean): { name?: string; locationNote?: string | null; capacity?: number | null; genderOptionId?: string | null } | RoomFailure {
  const out: { name?: string; locationNote?: string | null; capacity?: number | null; genderOptionId?: string | null } = {};
  if (create || "name" in record) {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (name.length < 1 || [...name].length > NAME_MAX) return field("name");
    out.name = name;
  }
  if ("locationNote" in record && record.locationNote !== null) {
    if (typeof record.locationNote !== "string" || [...record.locationNote.trim()].length > NOTE_MAX) return field("locationNote");
    out.locationNote = record.locationNote.trim() || null;
  }
  if ("capacity" in record && record.capacity !== null) {
    const capacity = record.capacity;
    if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > CAPACITY_MAX) return field("capacity");
    out.capacity = capacity;
  }
  if ("genderOptionId" in record && record.genderOptionId !== null) {
    if (typeof record.genderOptionId !== "string" || !GENDER_OPTIONS.includes(record.genderOptionId)) return field("genderOptionId");
    out.genderOptionId = record.genderOptionId;
  }
  return out;
}

function hasPermission(eventId: string, actorId: string, key: string): boolean {
  const perms = permissionsFor(eventId, actorId, actorId);
  return !("status" in perms) && perms.effective.includes(key);
}

function spaceAdmin(eventId: string, actorId: string): boolean {
  const event = eventById(eventId);
  const role = event ? spacesFor(actorId).find((space) => space.spaceId === event.spaceId)?.role : undefined;
  return role === "OWNER" || role === "ADMIN";
}

function readGate(eventId: string, actorId: string): RoomFailure | null {
  if (!eventById(eventId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (hasPermission(eventId, actorId, "ROOM_WRITE") || spaceAdmin(eventId, actorId)) return null;
  const perms = permissionsFor(eventId, actorId, actorId);
  return "status" in perms ? perms : { status: 403, code: "FORBIDDEN" };
}

function writeGate(eventId: string, actorId: string): RoomFailure | null {
  if (!eventById(eventId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  return perms.effective.includes("ROOM_WRITE") ? null : { status: 403, code: "FORBIDDEN" };
}

function stateGate(eventId: string): RoomFailure | null {
  const status = eventById(eventId)!.lifecycleStatus;
  if (status === "ENDED") return { status: 409, code: "EVENT_ENDED" };
  if (status === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  return null;
}

function boardOf(eventId: string): Board {
  let board = boards.get(eventId);
  if (!board) boards.set(eventId, (board = { version: 0, rooms: [], assignments: new Map(), publications: [], logs: [] }));
  return board;
}

function displayName(userId: string): string {
  return localUsers.find((user) => user.userId === userId)?.displayName ?? "운영자";
}

function field(name: string): RoomFailure {
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
