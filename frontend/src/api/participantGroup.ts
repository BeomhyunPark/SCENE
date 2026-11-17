import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * The participant's own group from the latest publication (#300, #303, DEC-072).
 * `group` is set only while ASSIGNED. `members` is set only for a leader of that group: names, 또래 and
 * the leader mark of its active members, never contact details. Everyone else gets no member names.
 * The value lives in the query cache only; never write it to localStorage or sessionStorage.
 */
export type ParticipantGroupStatus = "NOT_ELIGIBLE" | "NOT_PUBLISHED" | "UNASSIGNED" | "ASSIGNED";

export type ParticipantGroupMember = { name: string; cohort: string | null; leader: boolean };

export type ParticipantGroup = {
  status: ParticipantGroupStatus;
  publishedAt: string | null;
  group: { name: string; leaders: { name: string }[] } | null;
  leader: boolean;
  members: ParticipantGroupMember[] | null;
};

const STATUSES: readonly string[] = ["NOT_ELIGIBLE", "NOT_PUBLISHED", "UNASSIGNED", "ASSIGNED"];

export function getParticipantGroup(signal?: AbortSignal): Promise<ParticipantGroup> {
  return apiRequest<unknown>("/api/v1/participant/group", { signal }).then(parse);
}

function parse(value: unknown): ParticipantGroup {
  if (typeof value !== "object" || value === null) throw unexpected();
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string" || !STATUSES.includes(record.status)) throw unexpected();
  const status = record.status as ParticipantGroupStatus;
  const publishedAt = typeof record.publishedAt === "string" ? record.publishedAt : null;
  if (status !== "ASSIGNED") {
    return { status, publishedAt: status === "UNASSIGNED" ? publishedAt : null, group: null, leader: false, members: null };
  }
  const group = parseGroup(record.group);
  if (!group) throw unexpected();
  const leader = record.leader === true;
  return { status, publishedAt, group, leader, members: leader ? parseMembers(record.members) : null };
}

function parseGroup(value: unknown): ParticipantGroup["group"] {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string") return null;
  const leaders = Array.isArray(record.leaders)
    ? record.leaders.flatMap((item: unknown) =>
        typeof item === "object" && item !== null && typeof (item as { name?: unknown }).name === "string"
          ? [{ name: (item as { name: string }).name }]
          : [],
      )
    : [];
  return { name: record.name, leaders };
}

function parseMembers(value: unknown): ParticipantGroupMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string") return [];
    const cohort = typeof record.cohort === "string" && record.cohort.trim().length > 0 ? record.cohort : null;
    return [{ name: record.name, cohort, leader: record.leader === true }];
  });
}

function unexpected(): ApiError {
  return new ApiError({ status: 200, code: "UNEXPECTED" });
}
