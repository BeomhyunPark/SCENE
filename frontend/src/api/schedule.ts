import { apiRequest } from "./client";
import { ApiError, isApiError } from "./errors";
import type { LifecycleStatus } from "./events";

/**
 * Operator schedule (C4, DEC-081, backend/docs/api.md "일정표"). The items are the working copy (작업본);
 * participants see only the latest publication. Every item write can carry `publish: true` to save and
 * publish in one transaction ("저장하고 바로 공개"); when other unpublished changes exist the server answers
 * `409 CONFIRMATION_REQUIRED` with `otherChanges` and saves nothing. There is no Idempotency-Key: a resend
 * gets a version conflict, and the screen counts it done when the current item equals what it sent.
 */
export type ScheduleCategory = "WORSHIP" | "MEAL" | "PROGRAM" | "GROUP" | "FREE" | "MOVE" | "OTHER";
export type ScheduleAudience = "ALL" | "LEADERS" | "STAFF";
export type SchedulePublishState = "UNCHANGED" | "ADDED" | "CHANGED";
export type ScheduleSlotMeal = "BREAKFAST" | "LUNCH" | "DINNER" | "WORSHIP";

export const SCHEDULE_CATEGORIES: readonly ScheduleCategory[] = ["WORSHIP", "MEAL", "PROGRAM", "GROUP", "FREE", "MOVE", "OTHER"];

export const CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  WORSHIP: "집회",
  MEAL: "식사",
  PROGRAM: "프로그램",
  GROUP: "조 모임",
  FREE: "자유 시간",
  MOVE: "이동",
  OTHER: "기타",
};

export const AUDIENCE_LABEL: Record<ScheduleAudience, string> = { ALL: "전체", LEADERS: "조장", STAFF: "운영진" };

export const SCHEDULE_TITLE_MAX = 100;
export const SCHEDULE_PLACE_MAX = 100;
export const SCHEDULE_DESCRIPTION_MAX = 2000;

export type ScheduleDay = { day: number; date: string; dayLabel: string };

export type ScheduleItem = {
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
  audience: ScheduleAudience;
  leadersOnly: boolean;
  slotId: string | null;
  sortOrder: number;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
  publishState: SchedulePublishState;
  outOfPeriod: boolean;
};

export type ScheduleSlot = {
  slotId: string;
  day: number;
  dayLabel: string;
  meal: ScheduleSlotMeal;
  label: string;
  sortOrder: number;
  linkedItemId: string | null;
};

export type ScheduleWorkingPublication = {
  lastPublishedAt: string | null;
  lastPublishedByDisplayName: string | null;
  lastPublishedBoardVersion: number | null;
  hasUnpublishedChanges: boolean;
  pendingChanges: { added: number; changed: number; removed: number };
};

export type ScheduleBoard = {
  eventStatus: LifecycleStatus;
  boardVersion: number;
  startDate: string | null;
  endDate: string | null;
  timeZone: string;
  days: ScheduleDay[];
  items: ScheduleItem[];
  publication: ScheduleWorkingPublication;
  /** null when the event has no form setup with 식사·집회 칸. */
  slots: ScheduleSlot[] | null;
};

export type ChangeRef = { itemId: string; title: string };
export type ScheduleChanges = { added: ChangeRef[]; changed: (ChangeRef & { fields: string[] })[]; removed: ChangeRef[] };

export type SchedulePublishResult = {
  result: "PUBLISHED" | "ALREADY_PUBLISHED";
  publishedAt: string;
  boardVersion: number;
  changes: ScheduleChanges;
  notifiedCount: number;
};

export type ScheduleWriteResult = {
  item: ScheduleItem | null;
  boardVersion: number;
  publication: SchedulePublishResult | null;
};

/** What the editor sends. `null` clears an optional field. */
export type ScheduleItemInput = {
  day: number;
  startTime: string;
  endTime: string | null;
  title: string;
  place: string | null;
  description: string | null;
  category: ScheduleCategory;
  audience: ScheduleAudience;
  slotId: string | null;
};

export type PublishOptions = { publish: boolean; confirmOtherChanges: boolean; notify: boolean };

const base = (eventId: string) => `/api/v1/operator/events/${eventId}/schedule`;

export function getScheduleBoard(eventId: string, signal?: AbortSignal): Promise<ScheduleBoard> {
  return apiRequest<unknown>(base(eventId), { signal }).then(parseBoard);
}

export function createScheduleItem(eventId: string, input: ScheduleItemInput, options: PublishOptions): Promise<ScheduleWriteResult> {
  return apiRequest<unknown>(`${base(eventId)}/items`, {
    method: "POST",
    body: { ...input, audience: [{ type: input.audience }], ...options },
  }).then(parseWrite);
}

/** Sends only `changes` (the fields that differ from the item this screen saw). */
export function updateScheduleItem(
  eventId: string,
  itemId: string,
  expectedVersion: number,
  changes: Partial<ScheduleItemInput>,
  options: PublishOptions,
): Promise<ScheduleWriteResult> {
  const { audience, ...rest } = changes;
  return apiRequest<unknown>(`${base(eventId)}/items/${itemId}`, {
    method: "PATCH",
    body: { expectedVersion, ...rest, ...(audience ? { audience: [{ type: audience }] } : {}), ...options },
  }).then(parseWrite);
}

export function deleteScheduleItem(eventId: string, itemId: string, expectedVersion: number, options: PublishOptions): Promise<ScheduleWriteResult> {
  return apiRequest<unknown>(`${base(eventId)}/items/${itemId}`, {
    method: "DELETE",
    query: {
      expectedVersion,
      publish: options.publish,
      confirmOtherChanges: options.confirmOtherChanges,
      notify: options.notify,
    },
  }).then(parseWrite);
}

export function publishSchedule(eventId: string, expectedBoardVersion: number, notify: boolean): Promise<SchedulePublishResult> {
  return apiRequest<unknown>(`${base(eventId)}/publish`, { method: "POST", body: { expectedBoardVersion, notify } }).then((value) => {
    const parsed = parsePublish(value);
    if (!parsed) throw unexpected();
    return parsed;
  });
}

/** `409 CONFIRMATION_REQUIRED`: the other unpublished changes that would go out together. */
export function otherChangesOf(error: unknown): ScheduleChanges | null {
  if (!isApiError(error, "CONFIRMATION_REQUIRED")) return null;
  return parseChanges(error.extensions.otherChanges) ?? { added: [], changed: [], removed: [] };
}

/** `409 CONCURRENT_MODIFICATION` on an item write: the item as it is now. */
export function currentItemOf(error: unknown): ScheduleItem | null {
  if (!isApiError(error, "CONCURRENT_MODIFICATION")) return null;
  return parseItem(error.extensions.item);
}

/** `409 CONFLICT` reasons: `SLOT_ALREADY_LINKED`, `ITEMS_OUT_OF_PERIOD`, `EVENT_PERIOD_REQUIRED`, `ITEM_LIMIT`. */
export function conflictReason(error: unknown): string | null {
  if (!isApiError(error, "CONFLICT")) return null;
  return typeof error.extensions.reason === "string" ? error.extensions.reason : null;
}

export function outOfPeriodIdsOf(error: unknown): string[] {
  if (conflictReason(error) !== "ITEMS_OUT_OF_PERIOD") return [];
  const ids = (error as ApiError).extensions.itemIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function changeCount(changes: ScheduleChanges): number {
  return changes.added.length + changes.changed.length + changes.removed.length;
}

/** The input an existing item would send unchanged. */
export function inputOf(item: ScheduleItem): ScheduleItemInput {
  return {
    day: item.day,
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.title,
    place: item.place,
    description: item.description,
    category: item.category,
    audience: item.audience,
    slotId: item.slotId,
  };
}

/** Fields of `next` that differ from `before`. */
export function diffInput(before: ScheduleItemInput, next: ScheduleItemInput): Partial<ScheduleItemInput> {
  const out: Partial<ScheduleItemInput> = {};
  for (const key of Object.keys(next) as (keyof ScheduleItemInput)[]) {
    if (before[key] !== next[key]) (out as Record<string, unknown>)[key] = next[key];
  }
  return out;
}

function parseBoard(value: unknown): ScheduleBoard {
  if (!isRecord(value) || !isCount(value.boardVersion) || typeof value.eventStatus !== "string") throw unexpected();
  const publication = isRecord(value.publication) ? value.publication : {};
  const pending = isRecord(publication.pendingChanges) ? publication.pendingChanges : {};
  return {
    eventStatus: value.eventStatus as LifecycleStatus,
    boardVersion: value.boardVersion,
    startDate: stringOrNull(value.startDate),
    endDate: stringOrNull(value.endDate),
    timeZone: typeof value.timeZone === "string" ? value.timeZone : "Asia/Seoul",
    days: parseDays(value.days),
    items: Array.isArray(value.items) ? value.items.flatMap((item) => parseItem(item) ?? []) : [],
    publication: {
      lastPublishedAt: stringOrNull(publication.lastPublishedAt),
      lastPublishedByDisplayName: stringOrNull(publication.lastPublishedByDisplayName),
      lastPublishedBoardVersion: isCount(publication.lastPublishedBoardVersion) ? publication.lastPublishedBoardVersion : null,
      hasUnpublishedChanges: publication.hasUnpublishedChanges === true,
      pendingChanges: {
        added: isCount(pending.added) ? pending.added : 0,
        changed: isCount(pending.changed) ? pending.changed : 0,
        removed: isCount(pending.removed) ? pending.removed : 0,
      },
    },
    slots: Array.isArray(value.slots) ? value.slots.flatMap((slot) => parseSlot(slot) ?? []) : null,
  };
}

export function parseDays(value: unknown): ScheduleDay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((day) =>
    isRecord(day) && isCount(day.day) && typeof day.date === "string"
      ? [{ day: day.day, date: day.date, dayLabel: typeof day.dayLabel === "string" ? day.dayLabel : `${day.day}일차` }]
      : [],
  );
}

function parseItem(value: unknown): ScheduleItem | null {
  if (!isRecord(value) || typeof value.itemId !== "string" || !isCount(value.day) || typeof value.startTime !== "string") return null;
  if (typeof value.title !== "string") return null;
  const audience = Array.isArray(value.audience) && isRecord(value.audience[0]) ? value.audience[0].type : null;
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
    category: SCHEDULE_CATEGORIES.includes(value.category as ScheduleCategory) ? (value.category as ScheduleCategory) : "OTHER",
    audience: audience === "LEADERS" || audience === "STAFF" ? audience : "ALL",
    leadersOnly: value.leadersOnly === true,
    slotId: stringOrNull(value.slotId),
    sortOrder: isCount(value.sortOrder) ? value.sortOrder : 0,
    version: isCount(value.version) ? value.version : 1,
    updatedAt: stringOrNull(value.updatedAt),
    updatedByDisplayName: stringOrNull(value.updatedByDisplayName),
    publishState: value.publishState === "ADDED" || value.publishState === "CHANGED" ? value.publishState : "UNCHANGED",
    outOfPeriod: value.outOfPeriod === true,
  };
}

function parseSlot(value: unknown): ScheduleSlot | null {
  if (!isRecord(value) || typeof value.slotId !== "string" || !isCount(value.day)) return null;
  return {
    slotId: value.slotId,
    day: value.day,
    dayLabel: typeof value.dayLabel === "string" ? value.dayLabel : `${value.day}일차`,
    meal: (["BREAKFAST", "LUNCH", "DINNER", "WORSHIP"].includes(value.meal as string) ? value.meal : "WORSHIP") as ScheduleSlotMeal,
    label: typeof value.label === "string" ? value.label : value.slotId,
    sortOrder: isCount(value.sortOrder) ? value.sortOrder : 0,
    linkedItemId: stringOrNull(value.linkedItemId),
  };
}

function parseWrite(value: unknown): ScheduleWriteResult {
  if (!isRecord(value) || !isCount(value.boardVersion)) throw unexpected();
  return {
    item: parseItem(value.item),
    boardVersion: value.boardVersion,
    publication: value.publication == null ? null : parsePublish(value.publication),
  };
}

function parsePublish(value: unknown): SchedulePublishResult | null {
  if (!isRecord(value) || (value.result !== "PUBLISHED" && value.result !== "ALREADY_PUBLISHED")) return null;
  return {
    result: value.result,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : "",
    boardVersion: isCount(value.boardVersion) ? value.boardVersion : 0,
    changes: parseChanges(value.changes) ?? { added: [], changed: [], removed: [] },
    notifiedCount: isCount(value.notifiedCount) ? value.notifiedCount : 0,
  };
}

function parseChanges(value: unknown): ScheduleChanges | null {
  if (!isRecord(value)) return null;
  const refs = (list: unknown) =>
    Array.isArray(list)
      ? list.flatMap((item) =>
          isRecord(item) && typeof item.itemId === "string"
            ? [{ itemId: item.itemId, title: typeof item.title === "string" ? item.title : "", fields: Array.isArray(item.fields) ? item.fields.filter((f): f is string => typeof f === "string") : [] }]
            : [],
        )
      : [];
  return {
    added: refs(value.added).map(({ itemId, title }) => ({ itemId, title })),
    changed: refs(value.changed),
    removed: refs(value.removed).map(({ itemId, title }) => ({ itemId, title })),
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

function unexpected(): ApiError {
  return new ApiError({ status: 200, code: "UNEXPECTED" });
}
