import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * The participant's own group from the latest publication (#300, #303, DEC-072, DEC-083 · #452).
 * `group` is set only while ASSIGNED. `members` is the roster (name, 또래, 성별, leader and "me" marks)
 * when `rosterVisible`: always for the leader, for other members while the event switch is on. Only a
 * leader gets `leaderView` (member ids, arrival, attendance, room). No phone or answers are here: those
 * come one person at a time from the member detail. Values live in the query cache only; never write
 * them to localStorage or sessionStorage.
 */
export type ParticipantGroupStatus = "NOT_ELIGIBLE" | "NOT_PUBLISHED" | "UNASSIGNED" | "ASSIGNED";

export type ParticipantGroupMember = {
  name: string;
  cohort: string | null;
  gender: string | null;
  leader: boolean;
  me: boolean;
};

export type GroupSlot = {
  slotId: string;
  day: number;
  date: string;
  dayLabel: string;
  meal: string;
  label: string;
  sortOrder: number;
};

export type GroupAttendance = {
  type: "FULL" | "PARTIAL" | "WORSHIP_ONLY";
  arrivalSlotId: string | null;
  departureSlotId: string | null;
  /** null is "모름" (no answer, or no setup slots). */
  slotIds: string[] | null;
  /** null is "모름"; [] is not staying. */
  lodgingNights: number[] | null;
};

export type GroupCheckIn = { checkedIn: boolean; checkedInAt: string | null };

/** The member's room in the latest room publication (G2 #457); null before one or without a room. */
export type GroupRoom = { name: string; locationNote: string | null };

export type LeaderViewMember = {
  participantId: string;
  name: string;
  cohort: string | null;
  gender: string | null;
  leader: boolean;
  checkIn: GroupCheckIn;
  attendance: GroupAttendance;
  room: GroupRoom | null;
  applicationRevisedAt: string | null;
};

export type LeaderView = {
  activeCount: number;
  checkedInCount: number;
  slots: GroupSlot[] | null;
  members: LeaderViewMember[];
};

export type ParticipantGroup = {
  status: ParticipantGroupStatus;
  publishedAt: string | null;
  group: { name: string; leaders: { name: string }[] } | null;
  leader: boolean;
  rosterVisible: boolean;
  members: ParticipantGroupMember[] | null;
  leaderView: LeaderView | null;
};

export type GroupMemberAnswer = {
  fieldId: string;
  label: string;
  /** The server's reading text (same as the operator table and CSV); drawn as is. */
  display: string;
  operatorEdited: boolean;
};

export type GroupMemberDetail = {
  participantId: string;
  name: string;
  cohort: string | null;
  gender: string | null;
  leader: boolean;
  phone: string | null;
  checkIn: GroupCheckIn;
  attendance: GroupAttendance;
  room: GroupRoom | null;
  application: {
    submittedAt: string | null;
    revisedAt: string | null;
    revisedByOperator: boolean;
    answers: GroupMemberAnswer[];
  };
};

const STATUSES: readonly string[] = ["NOT_ELIGIBLE", "NOT_PUBLISHED", "UNASSIGNED", "ASSIGNED"];
const ATTENDANCE: readonly string[] = ["FULL", "PARTIAL", "WORSHIP_ONLY"];

export function getParticipantGroup(signal?: AbortSignal): Promise<ParticipantGroup> {
  return apiRequest<unknown>("/api/v1/participant/group", { signal }).then(parse);
}

/** Leader only (DEC-083 §3). Every failure is one 404; each read with a phone is logged by the server. */
export function getGroupMemberDetail(participantId: string, signal?: AbortSignal): Promise<GroupMemberDetail> {
  return apiRequest<unknown>(`/api/v1/participant/group/members/${encodeURIComponent(participantId)}`, { signal }).then(
    parseDetail,
  );
}

function parse(value: unknown): ParticipantGroup {
  if (!isRecord(value)) throw unexpected();
  if (typeof value.status !== "string" || !STATUSES.includes(value.status)) throw unexpected();
  const status = value.status as ParticipantGroupStatus;
  const publishedAt = typeof value.publishedAt === "string" ? value.publishedAt : null;
  const none = { group: null, leader: false, rosterVisible: false, members: null, leaderView: null };
  if (status !== "ASSIGNED") {
    return { status, publishedAt: status === "UNASSIGNED" ? publishedAt : null, ...none };
  }
  const group = parseGroup(value.group);
  if (!group) throw unexpected();
  const leader = value.leader === true;
  const rosterVisible = leader || value.rosterVisible === true;
  return {
    status,
    publishedAt,
    group,
    leader,
    rosterVisible,
    members: rosterVisible ? parseMembers(value.members) : null,
    leaderView: leader ? parseLeaderView(value.leaderView) : null,
  };
}

function parseGroup(value: unknown): ParticipantGroup["group"] {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const leaders = Array.isArray(value.leaders)
    ? value.leaders.flatMap((item: unknown) => (isRecord(item) && typeof item.name === "string" ? [{ name: item.name }] : []))
    : [];
  return { name: value.name, leaders };
}

function parseMembers(value: unknown): ParticipantGroupMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!isRecord(item) || typeof item.name !== "string") return [];
    return [{ name: item.name, cohort: text(item.cohort), gender: text(item.gender), leader: item.leader === true, me: item.me === true }];
  });
}

function parseLeaderView(value: unknown): LeaderView | null {
  if (!isRecord(value)) return null;
  const members = Array.isArray(value.members)
    ? value.members.flatMap((item: unknown) => {
        if (!isRecord(item) || typeof item.participantId !== "string" || typeof item.name !== "string") return [];
        return [
          {
            participantId: item.participantId,
            name: item.name,
            cohort: text(item.cohort),
            gender: text(item.gender),
            leader: item.leader === true,
            checkIn: parseCheckIn(item.checkIn),
            attendance: parseAttendance(item.attendance),
            room: parseRoom(item.room),
            applicationRevisedAt: typeof item.applicationRevisedAt === "string" ? item.applicationRevisedAt : null,
          },
        ];
      })
    : [];
  return {
    activeCount: count(value.activeCount) ?? members.length,
    checkedInCount: count(value.checkedInCount) ?? members.filter((member) => member.checkIn.checkedIn).length,
    slots: parseSlots(value.slots),
    members,
  };
}

function parseDetail(value: unknown): GroupMemberDetail {
  if (!isRecord(value) || typeof value.participantId !== "string" || typeof value.name !== "string") throw unexpected();
  const application = isRecord(value.application) ? value.application : {};
  const answers = Array.isArray(application.answers)
    ? application.answers.flatMap((item: unknown) => {
        if (!isRecord(item) || typeof item.label !== "string" || typeof item.display !== "string") return [];
        return [
          {
            fieldId: typeof item.fieldId === "string" ? item.fieldId : item.label,
            label: item.label,
            display: item.display,
            operatorEdited: item.operatorEdited === true,
          },
        ];
      })
    : [];
  return {
    participantId: value.participantId,
    name: value.name,
    cohort: text(value.cohort),
    gender: text(value.gender),
    leader: value.leader === true,
    phone: text(value.phone),
    checkIn: parseCheckIn(value.checkIn),
    attendance: parseAttendance(value.attendance),
    room: parseRoom(value.room),
    application: {
      submittedAt: typeof application.submittedAt === "string" ? application.submittedAt : null,
      revisedAt: typeof application.revisedAt === "string" ? application.revisedAt : null,
      revisedByOperator: application.revisedByOperator === true,
      answers,
    },
  };
}

function parseSlots(value: unknown): GroupSlot[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .flatMap((item: unknown) => {
      if (!isRecord(item) || typeof item.slotId !== "string" || typeof item.label !== "string") return [];
      return [
        {
          slotId: item.slotId,
          day: count(item.day) ?? 0,
          date: typeof item.date === "string" ? item.date : "",
          dayLabel: typeof item.dayLabel === "string" ? item.dayLabel : "",
          meal: typeof item.meal === "string" ? item.meal : "",
          label: item.label,
          sortOrder: count(item.sortOrder) ?? 0,
        },
      ];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function parseCheckIn(value: unknown): GroupCheckIn {
  if (!isRecord(value)) return { checkedIn: false, checkedInAt: null };
  const checkedIn = value.checkedIn === true;
  return { checkedIn, checkedInAt: checkedIn && typeof value.checkedInAt === "string" ? value.checkedInAt : null };
}

function parseAttendance(value: unknown): GroupAttendance {
  const record = isRecord(value) ? value : {};
  const type = typeof record.type === "string" && ATTENDANCE.includes(record.type) ? (record.type as GroupAttendance["type"]) : "FULL";
  return {
    type,
    arrivalSlotId: typeof record.arrivalSlotId === "string" ? record.arrivalSlotId : null,
    departureSlotId: typeof record.departureSlotId === "string" ? record.departureSlotId : null,
    slotIds: Array.isArray(record.slotIds) ? record.slotIds.filter((id): id is string => typeof id === "string") : null,
    lodgingNights: Array.isArray(record.lodgingNights)
      ? record.lodgingNights.filter((night): night is number => typeof night === "number")
      : null,
  };
}

function parseRoom(value: unknown): GroupRoom | null {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.trim().length === 0) return null;
  return { name: value.name, locationNote: text(value.locationNote) };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpected(): ApiError {
  return new ApiError({ status: 200, code: "UNEXPECTED" });
}
