import { apiRequest } from "./client";
import { ApiError, isApiError } from "./errors";
import type { LifecycleStatus } from "./events";

/**
 * Operator group board (#301, DEC-072, backend/docs/api.md "조 편성"). The board (작업본) is read with
 * GROUP_WRITE or an active space OWNER·ADMIN; every write needs GROUP_WRITE and a DRAFT or ACTIVE event.
 * There is no Idempotency-Key: an assignment already at its destination counts as done, so a resend
 * cannot apply twice. When a result is unknown, read the board again (DEC-047). Publishing (#302) snapshots
 * the working copy for participants; see `publishGroups`.
 */
export type Attendance = "FULL" | "PARTIAL" | "WORSHIP_ONLY";

export type Group = { groupId: string; name: string; sortOrder: number; version: number };

export type BoardParticipant = {
  participantId: string;
  /** The latest SUBMITTED application the answers come from; the screen opens its detail with it. */
  applicationId: string | null;
  name: string;
  cohort: string | null;
  gender: { optionId: string; label: string } | null;
  attendance: Attendance;
  middleGroup: string | null;
  cell: string | null;
  /** NEWCOMER answer (#316); null when unanswered or the question is off. Board only, never published. */
  newcomer: boolean | null;
  /** null is 미배정. */
  groupId: string | null;
  leader: boolean;
  publishedGroupId: string | null;
  publishedLeader: boolean;
  /**
   * Attendance slots (#315) in `slots` order. FULL is every slot. null is "모름" (PARTIAL·WORSHIP_ONLY with no
   * MEALS answer), which is not the same as [] (no slot). Always null when the board has no `slots`.
   */
  slotIds: string[] | null;
};

export type SlotMeal = "BREAKFAST" | "LUNCH" | "DINNER" | "WORSHIP";

/** One 참석 칸: a meal or worship of one day of the form setup (DEC-070), same ids as the summary's MEALS. */
export type AttendanceSlot = {
  slotId: string;
  day: number;
  date: string | null;
  dayLabel: string;
  meal: SlotMeal;
  label: string;
  sortOrder: number;
};

export type WithdrawnParticipant = { participantId: string; name: string; groupId: string | null };

export type Publication = {
  lastPublishedAt: string | null;
  lastPublishedByDisplayName: string | null;
  lastPublishedBoardVersion: number | null;
  activeCount: number;
  assignedCount: number;
  unassignedCount: number;
  changedParticipantCount: number;
  groupChanges: number;
  hasUnpublishedChanges: boolean;
};

export type GroupBoard = {
  eventStatus: LifecycleStatus;
  boardVersion: number;
  groups: Group[];
  participants: BoardParticipant[];
  withdrawn: WithdrawnParticipant[];
  publication: Publication;
  /** null when the form was not made from the setup card or has no meal·worship slot: no bars then. */
  slots: AttendanceSlot[] | null;
};

export type PublishResult = {
  result: "PUBLISHED" | "ALREADY_PUBLISHED";
  publicationId: string;
  publishedAt: string;
  boardVersion: number;
  assignedCount: number;
  unassignedCount: number;
  changedParticipantCount: number;
};

export type AssignmentChange = { participantId: string; fromGroupId: string | null; toGroupId: string | null };
export type AssignmentResult = { changed: number; alreadyApplied: number; boardVersion: number };
export type AssignmentConflict = { participantId: string; currentGroupId: string | null };

export const GROUP_NAME_MAX = 50;
export const GROUP_LEADERS_MAX = 3;
export const ASSIGNMENT_CHANGES_MAX = 200;

/**
 * GET …/groups/published (#288): the latest publication for operators with EVENT_READ. Before the first
 * publish `publishedAt` is null and both lists are empty (not 404). Withdrawn people are left out; people
 * who applied after the publish are in `unassigned`. Members list leaders first, then by name.
 */
export type PublishedMember = { participantId: string; name: string; cohort: string | null; leader: boolean };
export type PublishedGroup = {
  groupId: string;
  name: string;
  leaders: { participantId: string; name: string }[];
  members: PublishedMember[];
};
export type PublishedGroups = {
  publishedAt: string | null;
  groups: PublishedGroup[];
  unassigned: { participantId: string; name: string; cohort: string | null }[];
};

const base = (eventId: string) => `/api/v1/operator/events/${eventId}`;

export function getGroupBoard(eventId: string, signal?: AbortSignal): Promise<GroupBoard> {
  return apiRequest<unknown>(`${base(eventId)}/group-board`, { signal }).then(parseBoard);
}

export function getPublishedGroups(eventId: string, signal?: AbortSignal): Promise<PublishedGroups> {
  return apiRequest<unknown>(`${base(eventId)}/groups/published`, { signal }).then(parsePublished);
}

export function createGroup(eventId: string, name: string): Promise<{ group: Group; boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/groups`, { method: "POST", body: { name: name.trim() } }).then(
    parseGroupResult,
  );
}

export function renameGroup(
  eventId: string,
  groupId: string,
  name: string,
  expectedVersion: number,
): Promise<{ group: Group; boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/groups/${groupId}`, {
    method: "PATCH",
    body: { name: name.trim(), expectedVersion },
  }).then(parseGroupResult);
}

export function deleteGroup(
  eventId: string,
  groupId: string,
  expectedVersion: number,
): Promise<{ unassignedCount: number; boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/groups/${groupId}`, {
    method: "DELETE",
    query: { expectedVersion },
  }).then((value) => {
    if (!isRecord(value) || !isCount(value.unassignedCount) || !isCount(value.boardVersion)) unexpected();
    return { unassignedCount: value.unassignedCount, boardVersion: value.boardVersion };
  });
}

/** Must list every group of the event exactly once, or the server answers 409 CONFLICT. */
export function reorderGroups(eventId: string, groupIds: string[]): Promise<{ boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/groups/order`, { method: "PUT", body: { groupIds } }).then((value) => {
    if (!isRecord(value) || !isCount(value.boardVersion)) unexpected();
    return { boardVersion: value.boardVersion };
  });
}

/** All or nothing: one conflicting person and nothing is saved (409 CONCURRENT_MODIFICATION + conflicts). */
export function assignParticipants(eventId: string, changes: AssignmentChange[]): Promise<AssignmentResult> {
  return apiRequest<unknown>(`${base(eventId)}/group-assignments`, { method: "POST", body: { changes } }).then(
    (value) => {
      if (!isRecord(value) || !isCount(value.changed) || !isCount(value.alreadyApplied) || !isCount(value.boardVersion)) {
        unexpected();
      }
      return { changed: value.changed, alreadyApplied: value.alreadyApplied, boardVersion: value.boardVersion };
    },
  );
}

/** Replaces the group's whole leader list (0–3, members of that group only). */
export function setGroupLeaders(
  eventId: string,
  groupId: string,
  participantIds: string[],
  expectedVersion: number,
): Promise<{ group: Group; leaderIds: string[]; boardVersion: number }> {
  return apiRequest<unknown>(`${base(eventId)}/groups/${groupId}/leaders`, {
    method: "PUT",
    body: { participantIds, expectedVersion },
  }).then((value) => {
    if (!isRecord(value) || !Array.isArray(value.leaderIds) || !value.leaderIds.every((id) => typeof id === "string")) {
      unexpected();
    }
    const { group, boardVersion } = parseGroupResult(value);
    return { group, leaderIds: value.leaderIds as string[], boardVersion };
  });
}

/**
 * Publishes the working copy (#300). Server order after event state: 409 CONCURRENT_MODIFICATION
 * (+boardVersion) → 200 ALREADY_PUBLISHED → 409 CONFIRMATION_REQUIRED (+unassignedCount) → PUBLISHED.
 * After CONFIRMATION_REQUIRED, send the same `expectedBoardVersion` again with `confirmUnassigned: true`.
 */
export function publishGroups(
  eventId: string,
  expectedBoardVersion: number,
  confirmUnassigned: boolean,
): Promise<PublishResult> {
  return apiRequest<unknown>(`${base(eventId)}/groups/publish`, {
    method: "POST",
    body: { expectedBoardVersion, confirmUnassigned },
  }).then((value) => {
    if (
      !isRecord(value) ||
      (value.result !== "PUBLISHED" && value.result !== "ALREADY_PUBLISHED") ||
      typeof value.publicationId !== "string" ||
      typeof value.publishedAt !== "string" ||
      !isCount(value.boardVersion) ||
      !isCount(value.assignedCount) ||
      !isCount(value.unassignedCount) ||
      !isCount(value.changedParticipantCount)
    ) {
      unexpected();
    }
    return {
      result: value.result,
      publicationId: value.publicationId,
      publishedAt: value.publishedAt,
      boardVersion: value.boardVersion,
      assignedCount: value.assignedCount,
      unassignedCount: value.unassignedCount,
      changedParticipantCount: value.changedParticipantCount,
    };
  });
}

/** A count extension of a problem (`unassignedCount` of CONFIRMATION_REQUIRED, `boardVersion` of a 409). */
export function problemCount(error: unknown, key: string): number | null {
  if (!(error instanceof ApiError)) return null;
  const raw = error.extensions[key];
  return isCount(raw) ? raw : null;
}

/** `conflicts[]` of a 409 CONCURRENT_MODIFICATION from group-assignments; empty for anything else. */
export function assignmentConflicts(error: unknown): AssignmentConflict[] {
  if (!isApiError(error, "CONCURRENT_MODIFICATION")) return [];
  const raw = error.extensions.conflicts;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) =>
    isRecord(item) && typeof item.participantId === "string" && isNullableString(item.currentGroupId ?? null)
      ? [{ participantId: item.participantId, currentGroupId: (item.currentGroupId as string | null | undefined) ?? null }]
      : [],
  );
}

/** `participantIds` extension of a 409 (APPLICATION_NOT_SUBMITTED, LEADER_NOT_MEMBER). */
export function problemParticipantIds(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const raw = error.extensions.participantIds;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

export function problemReason(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  return typeof error.extensions.reason === "string" ? error.extensions.reason : null;
}

function unexpected(): never {
  throw new ApiError({ status: 200, code: "UNEXPECTED" });
}

function parsePublished(value: unknown): PublishedGroups {
  if (!isRecord(value) || !Array.isArray(value.groups) || !Array.isArray(value.unassigned)) unexpected();
  const person = (item: unknown) => {
    if (!isRecord(item) || typeof item.participantId !== "string" || typeof item.name !== "string") unexpected();
    return { participantId: item.participantId, name: item.name, cohort: typeof item.cohort === "string" ? item.cohort : null };
  };
  return {
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    groups: value.groups.map((group) => {
      if (!isRecord(group) || typeof group.groupId !== "string" || typeof group.name !== "string") unexpected();
      if (!Array.isArray(group.members)) unexpected();
      const members = group.members.map((item) => ({ ...person(item), leader: isRecord(item) && item.leader === true }));
      const leaders = members.filter((member) => member.leader).map(({ participantId, name }) => ({ participantId, name }));
      return { groupId: group.groupId, name: group.name, leaders, members };
    }),
    unassigned: value.unassigned.map(person),
  };
}

function parseGroupResult(value: unknown): { group: Group; boardVersion: number } {
  if (!isRecord(value) || !isCount(value.boardVersion)) unexpected();
  return { group: parseGroup(value.group), boardVersion: value.boardVersion };
}

function parseGroup(value: unknown): Group {
  if (
    !isRecord(value) ||
    typeof value.groupId !== "string" ||
    typeof value.name !== "string" ||
    !isCount(value.sortOrder) ||
    !isCount(value.version)
  ) {
    unexpected();
  }
  return { groupId: value.groupId, name: value.name, sortOrder: value.sortOrder, version: value.version };
}

function parseBoard(value: unknown): GroupBoard {
  if (
    !isRecord(value) ||
    !isLifecycleStatus(value.eventStatus) ||
    !isCount(value.boardVersion) ||
    !Array.isArray(value.groups) ||
    !Array.isArray(value.participants)
  ) {
    unexpected();
  }
  const withdrawn = Array.isArray(value.withdrawn) ? value.withdrawn : [];
  return {
    eventStatus: value.eventStatus,
    boardVersion: value.boardVersion,
    groups: value.groups.map(parseGroup).sort((a, b) => a.sortOrder - b.sortOrder),
    participants: value.participants.map(parseParticipant),
    withdrawn: withdrawn.map(parseWithdrawn),
    publication: parsePublication(value.publication),
    slots: Array.isArray(value.slots) ? value.slots.flatMap(parseSlot).sort((a, b) => a.sortOrder - b.sortOrder) : null,
  };
}

function parseParticipant(value: unknown): BoardParticipant {
  if (
    !isRecord(value) ||
    typeof value.participantId !== "string" ||
    typeof value.name !== "string" ||
    !isNullableString(value.groupId ?? null)
  ) {
    unexpected();
  }
  const gender = isRecord(value.gender) && typeof value.gender.optionId === "string" && typeof value.gender.label === "string"
    ? { optionId: value.gender.optionId, label: value.gender.label }
    : null;
  return {
    participantId: value.participantId,
    applicationId: typeof value.applicationId === "string" ? value.applicationId : null,
    name: value.name,
    cohort: trimmedOrNull(value.cohort),
    gender,
    attendance: isAttendance(value.attendance) ? value.attendance : "FULL",
    middleGroup: trimmedOrNull(value.middleGroup),
    cell: trimmedOrNull(value.cell),
    newcomer: typeof value.newcomer === "boolean" ? value.newcomer : null,
    groupId: (value.groupId as string | null | undefined) ?? null,
    leader: value.leader === true,
    publishedGroupId: typeof value.publishedGroupId === "string" ? value.publishedGroupId : null,
    publishedLeader: value.publishedLeader === true,
    slotIds: Array.isArray(value.slotIds) ? value.slotIds.filter((id): id is string => typeof id === "string") : null,
  };
}

function parseSlot(value: unknown): AttendanceSlot[] {
  if (
    !isRecord(value) ||
    typeof value.slotId !== "string" ||
    !isCount(value.day) ||
    typeof value.label !== "string" ||
    !isCount(value.sortOrder) ||
    (value.meal !== "BREAKFAST" && value.meal !== "LUNCH" && value.meal !== "DINNER" && value.meal !== "WORSHIP")
  ) {
    return [];
  }
  return [
    {
      slotId: value.slotId,
      day: value.day,
      date: typeof value.date === "string" ? value.date : null,
      dayLabel: typeof value.dayLabel === "string" ? value.dayLabel : `${value.day}일차`,
      meal: value.meal,
      label: value.label,
      sortOrder: value.sortOrder,
    },
  ];
}

function parseWithdrawn(value: unknown): WithdrawnParticipant {
  if (!isRecord(value) || typeof value.participantId !== "string" || typeof value.name !== "string") unexpected();
  return {
    participantId: value.participantId,
    name: value.name,
    groupId: typeof value.groupId === "string" ? value.groupId : null,
  };
}

function parsePublication(value: unknown): Publication {
  const record = isRecord(value) ? value : {};
  const count = (key: string) => (isCount(record[key]) ? (record[key] as number) : 0);
  return {
    lastPublishedAt: typeof record.lastPublishedAt === "string" ? record.lastPublishedAt : null,
    lastPublishedByDisplayName:
      typeof record.lastPublishedByDisplayName === "string" ? record.lastPublishedByDisplayName : null,
    lastPublishedBoardVersion: isCount(record.lastPublishedBoardVersion) ? record.lastPublishedBoardVersion : null,
    activeCount: count("activeCount"),
    assignedCount: count("assignedCount"),
    unassignedCount: count("unassignedCount"),
    changedParticipantCount: count("changedParticipantCount"),
    groupChanges: count("groupChanges"),
    hasUnpublishedChanges: record.hasUnpublishedChanges === true,
  };
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAttendance(value: unknown): value is Attendance {
  return value === "FULL" || value === "PARTIAL" || value === "WORSHIP_ONLY";
}

function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "ENDED" || value === "ARCHIVED";
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
