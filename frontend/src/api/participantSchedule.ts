import { apiRequest } from "./client";
import { ApiError } from "./errors";
import { parseDays, type ScheduleCategory, type ScheduleDay } from "./schedule";

/**
 * The participant's schedule (C5, DEC-081, api.md `GET /api/v1/participant/schedule`): the latest
 * publication, filtered to what this person may see. The server drops `change` marks and removed items
 * older than 24 hours, so the screen shows what it gets. `slotId` is in the answer for meal order (H4)
 * but this screen does not use it: meal order is out of the January scope (user decision 2026-11-20).
 */
export type ParticipantScheduleStatus = "NOT_ELIGIBLE" | "NOT_PUBLISHED" | "PUBLISHED";

export type ScheduleChangeFields = "day" | "startTime" | "endTime" | "place";

export type ParticipantScheduleItem = {
  itemId: string;
  day: number;
  date: string | null;
  startTime: string;
  endTime: string | null;
  endsNextDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  title: string;
  place: string | null;
  description: string | null;
  category: ScheduleCategory;
  sortOrder: number;
  leadersOnly: boolean;
  change: {
    kind: "ADDED" | "CHANGED";
    changedAt: string | null;
    fields: string[];
    /** Previous `day`·`startTime`·`endTime`·`place` among `fields`; a value may be null (was empty). */
    previous: Partial<Record<ScheduleChangeFields, string | number | null>> | null;
  } | null;
};

export type ParticipantRemovedItem = {
  itemId: string;
  day: number;
  date: string | null;
  title: string;
  startTime: string;
  removedAt: string | null;
};

export type ParticipantSchedule = {
  status: ParticipantScheduleStatus;
  publishedAt: string | null;
  timeZone: string;
  serverTime: string | null;
  days: ScheduleDay[];
  items: ParticipantScheduleItem[];
  removedItems: ParticipantRemovedItem[];
};

export function getParticipantSchedule(signal?: AbortSignal): Promise<ParticipantSchedule> {
  return apiRequest<unknown>("/api/v1/participant/schedule", { signal }).then(parseParticipantSchedule);
}

/** Marks this person's schedule notifications read (api.md `POST /participant/notifications/read`). Needs CSRF. */
export function markScheduleNotificationsRead(): Promise<unknown> {
  return apiRequest<unknown>("/api/v1/participant/notifications/read", {
    method: "POST",
    body: { target: { type: "SCHEDULE", id: null } },
  });
}

const STATUSES: readonly string[] = ["NOT_ELIGIBLE", "NOT_PUBLISHED", "PUBLISHED"];
const PREVIOUS_KEYS: readonly ScheduleChangeFields[] = ["day", "startTime", "endTime", "place"];

export function parseParticipantSchedule(value: unknown): ParticipantSchedule {
  if (!isRecord(value) || typeof value.status !== "string" || !STATUSES.includes(value.status)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const status = value.status as ParticipantScheduleStatus;
  const published = status === "PUBLISHED";
  return {
    status,
    publishedAt: published ? stringOrNull(value.publishedAt) : null,
    timeZone: typeof value.timeZone === "string" ? value.timeZone : "Asia/Seoul",
    serverTime: stringOrNull(value.serverTime),
    days: parseDays(value.days),
    items: published && Array.isArray(value.items) ? value.items.flatMap((item) => parseItem(item) ?? []) : [],
    removedItems: published && Array.isArray(value.removedItems) ? value.removedItems.flatMap((item) => parseRemoved(item) ?? []) : [],
  };
}

function parseItem(value: unknown): ParticipantScheduleItem | null {
  if (!isRecord(value) || typeof value.itemId !== "string" || !isCount(value.day)) return null;
  if (typeof value.startTime !== "string" || typeof value.title !== "string") return null;
  return {
    itemId: value.itemId,
    day: value.day,
    date: stringOrNull(value.date),
    startTime: value.startTime,
    endTime: stringOrNull(value.endTime),
    endsNextDay: value.endsNextDay === true,
    startsAt: stringOrNull(value.startsAt),
    endsAt: stringOrNull(value.endsAt),
    title: value.title,
    place: stringOrNull(value.place),
    description: stringOrNull(value.description),
    category: (typeof value.category === "string" ? value.category : "OTHER") as ScheduleCategory,
    sortOrder: isCount(value.sortOrder) ? value.sortOrder : 0,
    leadersOnly: value.leadersOnly === true,
    change: parseChange(value.change),
  };
}

function parseChange(value: unknown): ParticipantScheduleItem["change"] {
  if (!isRecord(value) || (value.kind !== "ADDED" && value.kind !== "CHANGED")) return null;
  let previous: Partial<Record<ScheduleChangeFields, string | number | null>> | null = null;
  if (isRecord(value.previous)) {
    previous = {};
    for (const key of PREVIOUS_KEYS) {
      if (!(key in value.previous)) continue;
      const raw = value.previous[key];
      previous[key] = typeof raw === "string" || typeof raw === "number" ? raw : null;
    }
  }
  return {
    kind: value.kind,
    changedAt: stringOrNull(value.changedAt),
    fields: Array.isArray(value.fields) ? value.fields.filter((field): field is string => typeof field === "string") : [],
    previous,
  };
}

function parseRemoved(value: unknown): ParticipantRemovedItem | null {
  if (!isRecord(value) || typeof value.itemId !== "string" || !isCount(value.day) || typeof value.title !== "string") return null;
  return {
    itemId: value.itemId,
    day: value.day,
    date: stringOrNull(value.date),
    title: value.title,
    startTime: typeof value.startTime === "string" ? value.startTime : "",
    removedAt: stringOrNull(value.removedAt),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
