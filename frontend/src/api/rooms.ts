import { apiRequest } from "./client";
import { ApiError, isApiError } from "./errors";
import type { LifecycleStatus } from "./events";
import type { Attendance, AttendanceSlot } from "./groups";

/**
 * Operator room board (G3 #458, DEC-085, backend/docs/api.md "숙소"). Same shape as the group board: a working
 * copy (rooms + one room per person) saved at once, and a publication participants see. The board is read with
 * ROOM_WRITE or an active space OWNER·ADMIN; every write needs ROOM_WRITE and a DRAFT or ACTIVE event. There is no
 * Idempotency-Key: an assignment already at its destination counts as done. Capacity and gender only warn;
 * someone who does not sleep over (`NOT_LODGING`) cannot be put in a room (409 INVALID_STATE_TRANSITION, reason
 * NOT_LODGING). "다시 볼 것" (A11 #461) is `review` on each person and `confirmRoomReview`.
 */
export type Lodging = "LODGING" | "NOT_LODGING" | "UNKNOWN";

export type RoomWarningCode = "OVER_CAPACITY" | "GENDER_MISMATCH" | "GENDER_UNKNOWN" | "NOT_LODGING";
export type RoomWarning = { code: RoomWarningCode; count?: number; capacity?: number; participantIds?: string[] };

export type ReviewReason = "NOT_LODGING" | "LODGING_CHANGED" | "ATTENDANCE_CHANGED" | "GENDER_CHANGED";
export type RoomReview = { reasons: ReviewReason[]; assignedAt: string | null };

export type RoomGender = { optionId: string; label: string | null };

export type Room = {
  roomId: string;
  name: string;
  locationNote: string | null;
  capacity: number | null;
  gender: RoomGender | null;
  sortOrder: number;
  version: number;
  memberCount: number;
  warnings: RoomWarning[];
};

export type RoomParticipant = {
  participantId: string;
  name: string;
  cohort: string | null;
  gender: { optionId: string; label: string } | null;
  attendance: Attendance;
  slotIds: string[] | null;
  lodging: Lodging;
  /** 1-based night numbers; null is 모름. */
  lodgingNights: number[] | null;
  /** The group of the latest group publication. */
  group: { groupId: string; name: string } | null;
  /** The group working copy's group, only for an operator with GROUP_WRITE. */
  draftGroupId: string | null;
  /** null is 미배정. */
  roomId: string | null;
  publishedRoomId: string | null;
  review: RoomReview | null;
};

export type RoomPublication = {
  lastPublishedAt: string | null;
  lastPublishedByDisplayName: string | null;
  lastPublishedBoardVersion: number | null;
  activeCount: number;
  eligibleCount: number;
  assignedCount: number;
  unassignedCount: number;
  notLodgingAssignedCount: number;
  changedParticipantCount: number;
  roomChanges: number;
  hasUnpublishedChanges: boolean;
};

export type RoomBoard = {
  eventStatus: LifecycleStatus;
  boardVersion: number;
  rooms: Room[];
  participants: RoomParticipant[];
  withdrawn: { participantId: string; name: string; roomId: string | null }[];
  publication: RoomPublication;
  groups: { groupId: string; name: string; sortOrder: number }[];
  slots: AttendanceSlot[] | null;
};

export type RoomFields = {
  name?: string;
  locationNote?: string | null;
  capacity?: number | null;
  genderOptionId?: string | null;
};

export type RoomChange = { participantId: string; fromRoomId: string | null; toRoomId: string | null };
export type RoomState = { roomId: string; memberCount: number; warnings: RoomWarning[] };
export type RoomAssignResult = { changed: number; alreadyApplied: number; boardVersion: number; rooms: RoomState[] };

export type RoomPublishResult = {
  result: "PUBLISHED" | "ALREADY_PUBLISHED";
  publishedAt: string;
  boardVersion: number;
  assignedCount: number;
  unassignedCount: number;
  notLodgingAssignedCount: number;
  changedParticipantCount: number;
  roomsWithWarnings: number;
  notifiedCount: number;
};

export type RoomRosterScope = "ALL" | "ROOMMATES" | "MY_ROOM";
export type ParticipantSettings = {
  groupRosterVisibleToMembers: boolean;
  roomRosterScope: RoomRosterScope;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

export const ROOM_NAME_MAX = 50;
export const ROOM_LOCATION_MAX = 100;
export const ROOM_CAPACITY_MAX = 50;
export const ROOMS_MAX = 200;
export const ROOM_CHANGES_MAX = 200;

const base = (eventId: string) => `/api/v1/operator/events/${eventId}`;

export function getRoomBoard(eventId: string, signal?: AbortSignal): Promise<RoomBoard> {
  return apiRequest<unknown>(`${base(eventId)}/room-board`, { signal }).then(parseBoard);
}

export function createRoom(eventId: string, fields: RoomFields): Promise<{ room: Room; boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/rooms`, { method: "POST", body: fields }).then(parseRoomResult);
}

/** Only the keys given change; null clears (not `name`). */
export function updateRoom(
  eventId: string,
  roomId: string,
  fields: RoomFields,
  expectedVersion: number,
): Promise<{ room: Room; boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/rooms/${roomId}`, {
    method: "PATCH",
    body: { ...fields, expectedVersion },
  }).then(parseRoomResult);
}

export function deleteRoom(
  eventId: string,
  roomId: string,
  expectedVersion: number,
): Promise<{ unassignedCount: number; boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/rooms/${roomId}`, { method: "DELETE", query: { expectedVersion } }).then(
    (value) => {
      if (!isRecord(value) || !isCount(value.unassignedCount) || !isCount(value.boardVersion)) unexpected();
      return { unassignedCount: value.unassignedCount, boardVersion: value.boardVersion };
    },
  );
}

/** Every room of the event exactly once, or 409 CONFLICT. */
export function reorderRooms(eventId: string, roomIds: string[]): Promise<{ boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/rooms/order`, { method: "PUT", body: { roomIds } }).then((value) => {
    if (!isRecord(value) || !isCount(value.boardVersion)) unexpected();
    return { boardVersion: value.boardVersion };
  });
}

/** All or nothing (one transaction). Filter-and-send, drag and drop and 조 단위 일괄 배정 all use this. */
export function assignRooms(eventId: string, changes: RoomChange[]): Promise<RoomAssignResult> {
  return apiRequest<unknown>(`${base(eventId)}/room-assignments`, { method: "POST", body: { changes } }).then((value) => {
    if (!isRecord(value) || !isCount(value.changed) || !isCount(value.alreadyApplied) || !isCount(value.boardVersion)) {
      unexpected();
    }
    const rooms = Array.isArray(value.rooms) ? value.rooms : [];
    return {
      changed: value.changed,
      alreadyApplied: value.alreadyApplied,
      boardVersion: value.boardVersion,
      rooms: rooms.flatMap((room) =>
        isRecord(room) && typeof room.roomId === "string" && isCount(room.memberCount)
          ? [{ roomId: room.roomId, memberCount: room.memberCount, warnings: parseWarnings(room.warnings) }]
          : [],
      ),
    };
  });
}

/** "확인" of 다시 볼 것 (A11): the current values become the basis; the room stays and boardVersion does not move. */
export function confirmRoomReview(
  eventId: string,
  participantIds: string[],
): Promise<{ confirmed: number; unchanged: number; notAssigned: number }> {
  return apiRequest<unknown>(`${base(eventId)}/room-assignments/review`, {
    method: "POST",
    body: { participantIds },
  }).then((value) => {
    if (!isRecord(value) || !isCount(value.confirmed) || !isCount(value.unchanged) || !isCount(value.notAssigned)) {
      unexpected();
    }
    return { confirmed: value.confirmed, unchanged: value.unchanged, notAssigned: value.notAssigned };
  });
}

/**
 * After the event state: 409 CONCURRENT_MODIFICATION (+boardVersion) → 200 ALREADY_PUBLISHED → 409
 * CONFIRMATION_REQUIRED (+unassignedCount, +notLodgingAssignedCount) → PUBLISHED.
 */
export function publishRooms(
  eventId: string,
  body: { expectedBoardVersion: number; confirmUnassigned: boolean; confirmNotLodging: boolean; notify: boolean },
): Promise<RoomPublishResult> {
  return apiRequest<unknown>(`${base(eventId)}/rooms/publish`, { method: "POST", body }).then((value) => {
    if (
      !isRecord(value) ||
      (value.result !== "PUBLISHED" && value.result !== "ALREADY_PUBLISHED") ||
      typeof value.publishedAt !== "string" ||
      !isCount(value.boardVersion)
    ) {
      unexpected();
    }
    const count = (key: string) => (isCount(value[key]) ? (value[key] as number) : 0);
    return {
      result: value.result,
      publishedAt: value.publishedAt,
      boardVersion: value.boardVersion,
      assignedCount: count("assignedCount"),
      unassignedCount: count("unassignedCount"),
      notLodgingAssignedCount: count("notLodgingAssignedCount"),
      changedParticipantCount: count("changedParticipantCount"),
      roomsWithWarnings: count("roomsWithWarnings"),
      notifiedCount: count("notifiedCount"),
    };
  });
}

/** api.md "조 편성" 참가자 설정 (DEC-083 §2). Read with EVENT_READ, write with EVENT_UPDATE. */
export function getParticipantSettings(eventId: string, signal?: AbortSignal): Promise<ParticipantSettings> {
  return apiRequest<unknown>(`${base(eventId)}/participant-settings`, { signal }).then(parseSettings);
}

export function updateRoomRosterScope(
  eventId: string,
  roomRosterScope: RoomRosterScope,
  expectedVersion: number,
): Promise<ParticipantSettings> {
  return apiRequest<unknown>(`${base(eventId)}/participant-settings`, {
    method: "PUT",
    body: { roomRosterScope, expectedVersion },
  }).then(parseSettings);
}

/** `participantIds` of a 409 (NOT_LODGING, APPLICATION_NOT_SUBMITTED). */
export function problemIds(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const raw = error.extensions.participantIds;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/** `conflicts[]` of 409 CONCURRENT_MODIFICATION from room-assignments. */
export function roomConflicts(error: unknown): { participantId: string; currentRoomId: string | null }[] {
  if (!isApiError(error, "CONCURRENT_MODIFICATION")) return [];
  const raw = error.extensions.conflicts;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) =>
    isRecord(item) && typeof item.participantId === "string"
      ? [{ participantId: item.participantId, currentRoomId: typeof item.currentRoomId === "string" ? item.currentRoomId : null }]
      : [],
  );
}

function unexpected(): never {
  throw new ApiError({ status: 200, code: "UNEXPECTED" });
}

function parseSettings(value: unknown): ParticipantSettings {
  if (!isRecord(value) || !isCount(value.version)) unexpected();
  const scope = value.roomRosterScope;
  return {
    groupRosterVisibleToMembers: value.groupRosterVisibleToMembers !== false,
    roomRosterScope: scope === "ROOMMATES" || scope === "MY_ROOM" ? scope : "ALL",
    version: value.version,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedByDisplayName: typeof value.updatedByDisplayName === "string" ? value.updatedByDisplayName : null,
  };
}

function parseRoomResult(value: unknown): { room: Room; boardVersion: number } {
  if (!isRecord(value) || !isCount(value.boardVersion)) unexpected();
  return { room: parseRoom(value.room), boardVersion: value.boardVersion };
}

function parseWarnings(value: unknown): RoomWarning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const code = item.code;
    if (code !== "OVER_CAPACITY" && code !== "GENDER_MISMATCH" && code !== "GENDER_UNKNOWN" && code !== "NOT_LODGING") return [];
    const warning: RoomWarning = { code };
    if (isCount(item.count)) warning.count = item.count;
    if (isCount(item.capacity)) warning.capacity = item.capacity;
    if (Array.isArray(item.participantIds)) {
      warning.participantIds = item.participantIds.filter((id): id is string => typeof id === "string");
    }
    return [warning];
  });
}

function parseRoom(value: unknown): Room {
  if (
    !isRecord(value) ||
    typeof value.roomId !== "string" ||
    typeof value.name !== "string" ||
    !isCount(value.sortOrder) ||
    !isCount(value.version)
  ) {
    unexpected();
  }
  const gender = isRecord(value.gender) && typeof value.gender.optionId === "string"
    ? { optionId: value.gender.optionId, label: typeof value.gender.label === "string" ? value.gender.label : null }
    : null;
  return {
    roomId: value.roomId,
    name: value.name,
    locationNote: typeof value.locationNote === "string" ? value.locationNote : null,
    capacity: isCount(value.capacity) ? value.capacity : null,
    gender,
    sortOrder: value.sortOrder,
    version: value.version,
    memberCount: isCount(value.memberCount) ? value.memberCount : 0,
    warnings: parseWarnings(value.warnings),
  };
}

const REASONS = new Set<ReviewReason>(["NOT_LODGING", "LODGING_CHANGED", "ATTENDANCE_CHANGED", "GENDER_CHANGED"]);

function parseReview(value: unknown): RoomReview | null {
  if (!isRecord(value) || !Array.isArray(value.reasons)) return null;
  const reasons = value.reasons.filter((reason): reason is ReviewReason => REASONS.has(reason as ReviewReason));
  if (reasons.length === 0) return null;
  return { reasons, assignedAt: typeof value.assignedAt === "string" ? value.assignedAt : null };
}

function parseParticipant(value: unknown): RoomParticipant {
  if (!isRecord(value) || typeof value.participantId !== "string" || typeof value.name !== "string") unexpected();
  const gender = isRecord(value.gender) && typeof value.gender.optionId === "string" && typeof value.gender.label === "string"
    ? { optionId: value.gender.optionId, label: value.gender.label }
    : null;
  const attendance = value.attendance;
  const lodging = value.lodging;
  const group = isRecord(value.group) && typeof value.group.groupId === "string" && typeof value.group.name === "string"
    ? { groupId: value.group.groupId, name: value.group.name }
    : null;
  return {
    participantId: value.participantId,
    name: value.name,
    cohort: typeof value.cohort === "string" && value.cohort.trim().length > 0 ? value.cohort.trim() : null,
    gender,
    attendance: attendance === "PARTIAL" || attendance === "WORSHIP_ONLY" ? attendance : "FULL",
    slotIds: Array.isArray(value.slotIds) ? value.slotIds.filter((id): id is string => typeof id === "string") : null,
    lodging: lodging === "LODGING" || lodging === "NOT_LODGING" ? lodging : "UNKNOWN",
    lodgingNights: Array.isArray(value.lodgingNights)
      ? value.lodgingNights.filter((night): night is number => typeof night === "number")
      : null,
    group,
    draftGroupId: typeof value.draftGroupId === "string" ? value.draftGroupId : null,
    roomId: typeof value.roomId === "string" ? value.roomId : null,
    publishedRoomId: typeof value.publishedRoomId === "string" ? value.publishedRoomId : null,
    review: parseReview(value.review),
  };
}

function parseSlot(value: unknown): AttendanceSlot[] {
  if (!isRecord(value) || typeof value.slotId !== "string" || !isCount(value.day) || typeof value.label !== "string") return [];
  const meal = value.meal;
  if (meal !== "BREAKFAST" && meal !== "LUNCH" && meal !== "DINNER" && meal !== "WORSHIP") return [];
  return [
    {
      slotId: value.slotId,
      day: value.day,
      date: typeof value.date === "string" ? value.date : null,
      dayLabel: typeof value.dayLabel === "string" ? value.dayLabel : `${value.day}일차`,
      meal,
      label: value.label,
      sortOrder: isCount(value.sortOrder) ? value.sortOrder : 0,
    },
  ];
}

function parseBoard(value: unknown): RoomBoard {
  if (
    !isRecord(value) ||
    !isLifecycleStatus(value.eventStatus) ||
    !isCount(value.boardVersion) ||
    !Array.isArray(value.rooms) ||
    !Array.isArray(value.participants)
  ) {
    unexpected();
  }
  const record = isRecord(value.publication) ? value.publication : {};
  const count = (key: string) => (isCount(record[key]) ? (record[key] as number) : 0);
  const withdrawn = Array.isArray(value.withdrawn) ? value.withdrawn : [];
  const groups = Array.isArray(value.groups) ? value.groups : [];
  return {
    eventStatus: value.eventStatus,
    boardVersion: value.boardVersion,
    rooms: value.rooms.map(parseRoom).sort((a, b) => a.sortOrder - b.sortOrder),
    participants: value.participants.map(parseParticipant),
    withdrawn: withdrawn.flatMap((item) =>
      isRecord(item) && typeof item.participantId === "string" && typeof item.name === "string"
        ? [{ participantId: item.participantId, name: item.name, roomId: typeof item.roomId === "string" ? item.roomId : null }]
        : [],
    ),
    publication: {
      lastPublishedAt: typeof record.lastPublishedAt === "string" ? record.lastPublishedAt : null,
      lastPublishedByDisplayName: typeof record.lastPublishedByDisplayName === "string" ? record.lastPublishedByDisplayName : null,
      lastPublishedBoardVersion: isCount(record.lastPublishedBoardVersion) ? record.lastPublishedBoardVersion : null,
      activeCount: count("activeCount"),
      eligibleCount: count("eligibleCount"),
      assignedCount: count("assignedCount"),
      unassignedCount: count("unassignedCount"),
      notLodgingAssignedCount: count("notLodgingAssignedCount"),
      changedParticipantCount: count("changedParticipantCount"),
      roomChanges: count("roomChanges"),
      hasUnpublishedChanges: record.hasUnpublishedChanges === true,
    },
    groups: groups
      .flatMap((group) =>
        isRecord(group) && typeof group.groupId === "string" && typeof group.name === "string"
          ? [{ groupId: group.groupId, name: group.name, sortOrder: isCount(group.sortOrder) ? group.sortOrder : 0 }]
          : [],
      )
      .sort((a, b) => a.sortOrder - b.sortOrder),
    slots: Array.isArray(value.slots) ? value.slots.flatMap(parseSlot).sort((a, b) => a.sortOrder - b.sortOrder) : null,
  };
}

function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "ENDED" || value === "ARCHIVED";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
