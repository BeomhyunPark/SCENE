import { localUsers } from "./fixtures/seed";
import { readParticipantGroup } from "./groupStore";
import { eventById } from "./operatorStore";
import { bumpFeed } from "./participantFeedStore";
import { checkInCandidates } from "./participantStore";
import { notifyOperators, operatorsWith } from "./notificationStore";
import { permissionsFor } from "./taskStore";

/**
 * Shaped like NoticeController and ParticipantNoticeController (DEC-082, api.md "공지", D2 #434).
 * Participant notifications for notices live here too, so `updates.notifications`, the list's
 * `unread` and `POST /participant/notifications/read` agree. Titles and bodies are never logged.
 */
type Audience = "ALL" | "LEADERS" | "STAFF";
type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type Row = {
  eventId: string;
  noticeId: string;
  title: string;
  body: string;
  important: boolean;
  pinned: boolean;
  audience: Audience;
  status: Status;
  version: number;
  firstPublishedAt: string | null;
  publishedAt: string | null;
  editedAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  updatedBy: string;
  updatedAt: string;
  /** Mock only: an increasing number so equal timestamps keep a stable order. */
  order: number;
};

type Notification = {
  seq: number;
  participantId: string;
  noticeId: string;
  kind: "NOTICE_PUBLISHED" | "NOTICE_UPDATED";
  readAt: string | null;
};

export type NoticeFailure = { status: number; code: string; [key: string]: unknown };

const PIN_LIMIT = 3;
let rows: Row[] = [];
let notifications: Notification[] = [];
let seq = 0;
let order = 0;
let clock = 0;
/** `notice_boards.version`: every real write of the event's notices, whatever the audience (operator `updates.notices`). */
const boards = new Map<string, number>();

export function noticeBoardVersion(eventId: string): number {
  return boards.get(eventId) ?? 0;
}

function bumpBoard(eventId: string): void {
  boards.set(eventId, noticeBoardVersion(eventId) + 1);
}

export function resetNoticeStore(): void {
  boards.clear();
  rows = [];
  notifications = [];
  seq = 0;
  order = 0;
  clock = 0;
}

/** Strictly increasing ISO time, so two writes in one millisecond still sort. */
function now(): string {
  clock = Math.max(clock + 1, Date.now());
  return new Date(clock).toISOString();
}

function nameOf(userId: string): string | null {
  return localUsers.find((user) => user.userId === userId)?.displayName ?? null;
}

function toBody(row: Row) {
  return {
    noticeId: row.noticeId,
    title: row.title,
    body: row.body,
    important: row.important,
    pinned: row.pinned,
    audience: [{ type: row.audience }],
    status: row.status,
    version: row.version,
    firstPublishedAt: row.firstPublishedAt,
    publishedAt: row.publishedAt,
    editedAt: row.editedAt,
    archivedAt: row.archivedAt,
    createdByDisplayName: nameOf(row.createdBy),
    updatedByDisplayName: nameOf(row.updatedBy),
    updatedAt: row.updatedAt,
  };
}

function field(name: string): NoticeFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}

function gate(eventId: string, actorId: string, write: boolean): NoticeFailure | null {
  if (!eventById(eventId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  if (write && !perms.effective.includes("NOTICE_WRITE")) return { status: 403, code: "FORBIDDEN" };
  return null;
}

function archivedEvent(eventId: string): NoticeFailure | null {
  const status = eventById(eventId)?.lifecycleStatus;
  return status === "ARCHIVED" ? { status: 409, code: "EVENT_ARCHIVED", eventStatus: status } : null;
}

function find(eventId: string, noticeId: string): Row | undefined {
  return rows.find((row) => row.eventId === eventId && row.noticeId === noticeId);
}

function isAudience(value: unknown): Audience | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const item = value[0] as Record<string, unknown> | null;
  if (!item || typeof item !== "object" || Object.keys(item).some((key) => key !== "type")) return null;
  return item.type === "ALL" || item.type === "LEADERS" || item.type === "STAFF" ? item.type : null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && [...trimmed].length <= 100 ? trimmed : null;
}

function cleanBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && [...trimmed].length <= 5000 ? trimmed : null;
}

function pinnedPublished(eventId: string, except?: string): Row[] {
  return rows
    .filter((row) => row.eventId === eventId && row.status === "PUBLISHED" && row.pinned && row.noticeId !== except)
    .sort(byPublishedDesc);
}

function pinLimit(eventId: string): NoticeFailure {
  return { status: 409, code: "CONFLICT", reason: "PIN_LIMIT", pinnedNoticeIds: pinnedPublished(eventId).map((row) => row.noticeId) };
}

function byPublishedDesc(a: Row, b: Row): number {
  return (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt) || b.order - a.order;
}

function reachesParticipants(audience: Audience): boolean {
  return audience !== "STAFF";
}

/** Who sees a notice among participants: active participants, and for LEADERS the published leaders. */
function participantSees(row: Row, participantId: string): boolean {
  if (row.status !== "PUBLISHED" || row.audience === "STAFF") return false;
  if (!checkInCandidates(row.eventId).some((person) => person.participantId === participantId)) return false;
  if (row.audience === "LEADERS") return readParticipantGroup(row.eventId, participantId).leader;
  return true;
}

/** Notifications for this notice; returns how many rows it made (participants + operators). */
function notify(row: Row, kind: Notification["kind"], actorId: string): number {
  if (row.audience === "STAFF") {
    const operators = operatorsWith(row.eventId, "EVENT_READ", actorId);
    const updated = kind === "NOTICE_UPDATED";
    notifyOperators(row.eventId, operators, {
      kind: updated ? "STAFF_NOTICE_UPDATED" : "STAFF_NOTICE_PUBLISHED",
      target: { type: "NOTICE", id: row.noticeId },
      title: updated ? (row.important ? "중요 공지 수정" : "공지 수정") : row.important ? "중요 운영진 공지" : "운영진 공지",
      body: row.title,
      important: row.important,
    });
    return operators.length;
  }
  let count = 0;
  for (const person of checkInCandidates(row.eventId)) {
    if (!participantSees(row, person.participantId)) continue;
    const merged = notifications.findIndex(
      (item) => item.participantId === person.participantId && item.noticeId === row.noticeId && item.kind === kind && !item.readAt,
    );
    if (merged >= 0) notifications.splice(merged, 1);
    notifications.push({ seq: ++seq, participantId: person.participantId, noticeId: row.noticeId, kind, readAt: null });
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------------------------
// Operator

export function listOperatorNotices(eventId: string, actorId: string, search: URLSearchParams) {
  const denied = gate(eventId, actorId, false);
  if (denied) return denied;
  const statuses = (search.get("status") ?? "DRAFT,PUBLISHED").split(",");
  if (statuses.some((status) => !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status))) return field("status");
  const audiences = search.get("audience")?.split(",") ?? ["ALL", "LEADERS", "STAFF"];
  if (audiences.some((audience) => !["ALL", "LEADERS", "STAFF"].includes(audience))) return field("audience");
  const limit = Number(search.get("limit") ?? 30);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return field("limit");
  const before = search.get("before");
  const start = before === null ? 0 : Number(before);
  if (!Number.isInteger(start) || start < 0) return field("before");
  const rank = (row: Row) => (row.status === "PUBLISHED" && row.pinned ? 0 : row.status === "DRAFT" ? 1 : 2);
  const sorted = rows
    .filter((row) => row.eventId === eventId && statuses.includes(row.status) && audiences.includes(row.audience))
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      if (rank(a) === 1) return b.updatedAt.localeCompare(a.updatedAt) || b.order - a.order;
      return byPublishedDesc(a, b);
    });
  const page = sorted.slice(start, start + limit);
  return {
    items: page.map(toBody),
    pinnedCount: pinnedPublished(eventId).length,
    nextBefore: start + limit < sorted.length ? String(start + limit) : null,
  };
}

export function readOperatorNotice(eventId: string, noticeId: string, actorId: string) {
  const denied = gate(eventId, actorId, false);
  if (denied) return denied;
  const row = find(eventId, noticeId);
  return row ? toBody(row) : { status: 404, code: "RESOURCE_NOT_FOUND" };
}

export function createOperatorNotice(eventId: string, actorId: string, input: unknown) {
  const denied = gate(eventId, actorId, true);
  if (denied) return denied;
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!body) return field("body");
  const title = cleanTitle(body.title);
  if (title === null) return field("title");
  const text = cleanBody(body.body);
  if (text === null) return field("body");
  if (body.important !== undefined && typeof body.important !== "boolean") return field("important");
  if (body.pinned !== undefined && typeof body.pinned !== "boolean") return field("pinned");
  const audience = isAudience(body.audience);
  if (!audience) return field("audience");
  if (body.publish !== undefined && typeof body.publish !== "boolean") return field("publish");
  const archived = archivedEvent(eventId);
  if (archived) return archived;
  const publish = body.publish === true;
  const pinned = body.pinned === true;
  if (publish && pinned && pinnedPublished(eventId).length >= PIN_LIMIT) return pinLimit(eventId);
  const at = now();
  const row: Row = {
    eventId,
    noticeId: crypto.randomUUID(),
    title,
    body: text,
    important: body.important === true,
    pinned,
    audience,
    status: publish ? "PUBLISHED" : "DRAFT",
    version: 1,
    firstPublishedAt: publish ? at : null,
    publishedAt: publish ? at : null,
    editedAt: null,
    archivedAt: null,
    createdBy: actorId,
    updatedBy: actorId,
    updatedAt: at,
    order: ++order,
  };
  rows.push(row);
  bumpBoard(eventId);
  let notifiedCount = 0;
  if (publish) {
    notifiedCount = notify(row, "NOTICE_PUBLISHED", actorId);
    if (reachesParticipants(audience)) bumpFeed(eventId, "notices");
  }
  return { notice: toBody(row), notifiedCount };
}

export function patchOperatorNotice(eventId: string, noticeId: string, actorId: string, input: unknown) {
  const denied = gate(eventId, actorId, true);
  if (denied) return denied;
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!body) return field("body");
  const next: Partial<Pick<Row, "title" | "body" | "important" | "pinned" | "audience">> = {};
  if ("title" in body) {
    const title = cleanTitle(body.title);
    if (title === null) return field("title");
    next.title = title;
  }
  if ("body" in body) {
    const text = cleanBody(body.body);
    if (text === null) return field("body");
    next.body = text;
  }
  if ("important" in body) {
    if (typeof body.important !== "boolean") return field("important");
    next.important = body.important;
  }
  if ("pinned" in body) {
    if (typeof body.pinned !== "boolean") return field("pinned");
    next.pinned = body.pinned;
  }
  if ("audience" in body) {
    const audience = isAudience(body.audience);
    if (!audience) return field("audience");
    next.audience = audience;
  }
  if ("notify" in body && typeof body.notify !== "boolean") return field("notify");
  const expected = body.expectedVersion;
  if (typeof expected !== "number" || !Number.isInteger(expected)) return field("expectedVersion");
  const archived = archivedEvent(eventId);
  if (archived) return archived;
  const row = find(eventId, noticeId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (row.version !== expected) return conflict(row);
  if (row.status === "ARCHIVED") return { status: 409, code: "INVALID_STATE_TRANSITION", noticeStatus: row.status };
  const contentKeys = ["title", "body", "important", "audience"] as const;
  const contentChanged = contentKeys.some((key) => next[key] !== undefined && next[key] !== row[key]);
  const pinChanged = next.pinned !== undefined && next.pinned !== row.pinned;
  if (!contentChanged && !pinChanged) return { notice: toBody(row), notifiedCount: 0 };
  if (row.status === "PUBLISHED" && next.pinned === true && !row.pinned && pinnedPublished(eventId).length >= PIN_LIMIT) {
    return pinLimit(eventId);
  }
  const audienceBefore = row.audience;
  Object.assign(row, next);
  const at = now();
  row.version += 1;
  row.updatedBy = actorId;
  row.updatedAt = at;
  bumpBoard(eventId);
  let notifiedCount = 0;
  if (row.status === "PUBLISHED") {
    if (contentChanged) row.editedAt = at;
    if (contentChanged && body.notify === true) notifiedCount = notify(row, "NOTICE_UPDATED", actorId);
    if (reachesParticipants(audienceBefore) || reachesParticipants(row.audience)) bumpFeed(eventId, "notices");
  }
  return { notice: toBody(row), notifiedCount };
}

export function deleteOperatorNotice(eventId: string, noticeId: string, actorId: string, search: URLSearchParams) {
  const denied = gate(eventId, actorId, true);
  if (denied) return denied;
  const expected = Number(search.get("expectedVersion"));
  if (!Number.isInteger(expected) || search.get("expectedVersion") === null) return field("expectedVersion");
  const archived = archivedEvent(eventId);
  if (archived) return archived;
  const row = find(eventId, noticeId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (row.version !== expected) return conflict(row);
  if (row.status !== "DRAFT") return { status: 409, code: "INVALID_STATE_TRANSITION", noticeStatus: row.status };
  rows = rows.filter((item) => item !== row);
  bumpBoard(eventId);
  return null;
}

export function commandOperatorNotice(
  eventId: string,
  noticeId: string,
  actorId: string,
  command: string,
  input: unknown,
) {
  const denied = gate(eventId, actorId, true);
  if (denied) return denied;
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  const expected = body?.expectedVersion;
  if (typeof expected !== "number" || !Number.isInteger(expected)) return field("expectedVersion");
  const archived = archivedEvent(eventId);
  if (archived) return archived;
  const row = find(eventId, noticeId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (command === "publish" && row.status === "PUBLISHED") return { result: "ALREADY_PUBLISHED", notice: toBody(row), notifiedCount: 0 };
  if (command === "archive" && row.status === "ARCHIVED") return { result: "ALREADY_ARCHIVED", notice: toBody(row), notifiedCount: 0 };
  if (row.version !== expected) return conflict(row);
  const at = now();
  if (command === "publish") {
    if (row.status !== "DRAFT") return { status: 409, code: "INVALID_STATE_TRANSITION", noticeStatus: row.status };
    if (row.pinned && pinnedPublished(eventId).length >= PIN_LIMIT) return pinLimit(eventId);
    Object.assign(row, { status: "PUBLISHED", firstPublishedAt: at, publishedAt: at });
    touch(row, actorId, at);
    const notifiedCount = notify(row, "NOTICE_PUBLISHED", actorId);
    if (reachesParticipants(row.audience)) bumpFeed(eventId, "notices");
    return { result: "PUBLISHED", notice: toBody(row), notifiedCount };
  }
  if (command === "archive") {
    const wasPublished = row.status === "PUBLISHED";
    Object.assign(row, { status: "ARCHIVED", pinned: false, archivedAt: at });
    touch(row, actorId, at);
    for (const item of notifications) if (item.noticeId === row.noticeId && !item.readAt) item.readAt = at;
    if (wasPublished && reachesParticipants(row.audience)) bumpFeed(eventId, "notices");
    return { result: "ARCHIVED", notice: toBody(row), notifiedCount: 0 };
  }
  if (command === "unarchive") {
    if (row.status !== "ARCHIVED") return { status: 409, code: "INVALID_STATE_TRANSITION", noticeStatus: row.status };
    const restored: Status = row.firstPublishedAt ? "PUBLISHED" : "DRAFT";
    Object.assign(row, { status: restored, archivedAt: null });
    touch(row, actorId, at);
    if (restored === "PUBLISHED" && reachesParticipants(row.audience)) bumpFeed(eventId, "notices");
    return { result: "UNARCHIVED", notice: toBody(row), notifiedCount: 0 };
  }
  return { status: 404, code: "RESOURCE_NOT_FOUND" };
}

function touch(row: Row, actorId: string, at: string): void {
  bumpBoard(row.eventId);
  row.version += 1;
  row.updatedBy = actorId;
  row.updatedAt = at;
}

function conflict(row: Row): NoticeFailure {
  return {
    status: 409,
    code: "CONCURRENT_MODIFICATION",
    notice: {
      noticeId: row.noticeId,
      status: row.status,
      version: row.version,
      updatedAt: row.updatedAt,
      updatedByDisplayName: nameOf(row.updatedBy),
    },
  };
}

/** Test seam: another operator edits the notice without this screen knowing. */
export function editAsOtherOperator(eventId: string, noticeId: string, changes: { title?: string; body?: string }): void {
  const row = find(eventId, noticeId);
  if (!row) return;
  Object.assign(row, changes);
  touch(row, localUsers[1].userId, now());
  if (row.status === "PUBLISHED") row.editedAt = row.updatedAt;
}

// ---------------------------------------------------------------------------------------------
// Participant

function participantItem(row: Row, participantId: string) {
  const flat = row.body.replace(/\s*\n\s*/g, " ");
  return {
    noticeId: row.noticeId,
    title: row.title,
    bodyPreview: [...flat].length > 80 ? `${[...flat].slice(0, 80).join("")}…` : flat,
    important: row.important,
    pinned: row.pinned,
    leadersOnly: row.audience === "LEADERS",
    publishedAt: row.publishedAt,
    editedAt: row.editedAt,
    unread: notifications.some((item) => item.participantId === participantId && item.noticeId === row.noticeId && !item.readAt),
  };
}

export function listParticipantNotices(eventId: string, participantId: string, search: URLSearchParams) {
  const limit = Number(search.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return field("limit");
  const before = search.get("before");
  const start = before === null ? 0 : Number(before);
  if (!Number.isInteger(start) || start < 0) return field("before");
  const visible = rows
    .filter((row) => row.eventId === eventId && participantSees(row, participantId))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || byPublishedDesc(a, b));
  return {
    items: visible.slice(start, start + limit).map((row) => participantItem(row, participantId)),
    nextBefore: start + limit < visible.length ? String(start + limit) : null,
  };
}

export function readParticipantNotice(eventId: string, participantId: string, noticeId: string) {
  const row = find(eventId, noticeId);
  if (!row || !participantSees(row, participantId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  return { ...participantItem(row, participantId), body: row.body };
}

/** `POST /participant/notifications/read` for this store's notifications. */
export function readParticipantNotifications(participantId: string, input: unknown): { unreadCount: number } | NoticeFailure {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!body) return field("body");
  const keys = ["notificationIds", "target", "upToSeq"].filter((key) => key in body);
  if (keys.length !== 1) return field("body");
  const at = now();
  const mine = notifications.filter((item) => item.participantId === participantId && !item.readAt);
  if (keys[0] === "target") {
    const target = body.target as Record<string, unknown> | null;
    if (!target || typeof target.type !== "string" || typeof target.id !== "string") return field("target");
    if (target.type === "NOTICE") for (const item of mine) if (item.noticeId === target.id) item.readAt = at;
  } else if (keys[0] === "upToSeq") {
    const upTo = body.upToSeq;
    if (typeof upTo !== "number" || !Number.isInteger(upTo) || upTo < 1) return field("upToSeq");
    for (const item of mine) if (item.seq <= upTo) item.readAt = at;
  }
  return { unreadCount: participantNotificationSummary(participantId).unreadCount };
}

/** For `updates.notifications`. */
export function participantNotificationSummary(participantId: string): { latestSeq: number; unreadCount: number } {
  const mine = notifications.filter((item) => item.participantId === participantId);
  return {
    latestSeq: mine.reduce((max, item) => Math.max(max, item.seq), 0),
    unreadCount: Math.min(100, mine.filter((item) => !item.readAt).length),
  };
}
