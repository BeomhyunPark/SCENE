import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * Notices (DEC-082, backend/docs/api.md "공지"). Titles and bodies may hold names and phone numbers,
 * so nothing here logs them.
 */
export type NoticeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type NoticeAudienceType = "ALL" | "LEADERS" | "STAFF";

export const NOTICE_TITLE_MAX = 100;
export const NOTICE_BODY_MAX = 5_000;
/** Published pinned notices per event (DEC-082 §8). */
export const NOTICE_PIN_LIMIT = 3;

export type OperatorNotice = {
  noticeId: string;
  title: string;
  body: string;
  important: boolean;
  pinned: boolean;
  audience: NoticeAudienceType;
  status: NoticeStatus;
  version: number;
  firstPublishedAt: string | null;
  publishedAt: string | null;
  editedAt: string | null;
  archivedAt: string | null;
  createdByDisplayName: string | null;
  updatedByDisplayName: string | null;
  updatedAt: string | null;
};

export type OperatorNoticePage = { items: OperatorNotice[]; pinnedCount: number; nextBefore: string | null };

export type NoticeListQuery = {
  status?: NoticeStatus[];
  audience?: NoticeAudienceType[];
  before?: string;
  limit?: number;
};

export function listNotices(eventId: string, query: NoticeListQuery = {}, signal?: AbortSignal): Promise<OperatorNoticePage> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/notices`, {
    query: {
      status: query.status?.join(","),
      audience: query.audience?.join(","),
      before: query.before,
      limit: query.limit,
    },
    signal,
  }).then((value) => {
    if (!isRecord(value) || !Array.isArray(value.items) || typeof value.pinnedCount !== "number") throw unexpected();
    return {
      items: value.items.map(parseOperatorNotice),
      pinnedCount: value.pinnedCount,
      nextBefore: typeof value.nextBefore === "string" ? value.nextBefore : null,
    };
  });
}

export function getNotice(eventId: string, noticeId: string, signal?: AbortSignal): Promise<OperatorNotice> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/notices/${noticeId}`, { signal }).then(parseOperatorNotice);
}

export type NoticeInput = {
  title: string;
  body: string;
  important: boolean;
  pinned: boolean;
  audience: NoticeAudienceType;
};

export type NoticeWriteResult = { notice: OperatorNotice; notifiedCount: number };

/** `publish: true` creates and publishes in one request (the D3 three-tap path). */
export function createNotice(eventId: string, input: NoticeInput & { publish: boolean }): Promise<NoticeWriteResult> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/notices`, {
    method: "POST",
    body: {
      title: input.title,
      body: input.body,
      important: input.important,
      pinned: input.pinned,
      audience: [{ type: input.audience }],
      publish: input.publish,
    },
  }).then(parseWriteResult);
}

export type NoticePatch = Partial<NoticeInput> & { expectedVersion: number; notify?: boolean };

/** Sends only the changed keys. `notify` matters only for a published notice whose content changes. */
export function patchNotice(eventId: string, noticeId: string, patch: NoticePatch): Promise<NoticeWriteResult> {
  const body: Record<string, unknown> = { expectedVersion: patch.expectedVersion };
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.body !== undefined) body.body = patch.body;
  if (patch.important !== undefined) body.important = patch.important;
  if (patch.pinned !== undefined) body.pinned = patch.pinned;
  if (patch.audience !== undefined) body.audience = [{ type: patch.audience }];
  if (patch.notify) body.notify = true;
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/notices/${noticeId}`, { method: "PATCH", body }).then(
    parseWriteResult,
  );
}

/** Only a DRAFT is deleted. */
export function deleteNotice(eventId: string, noticeId: string, expectedVersion: number): Promise<void> {
  return apiRequest<void>(`/api/v1/operator/events/${eventId}/notices/${noticeId}`, {
    method: "DELETE",
    query: { expectedVersion },
  });
}

export type NoticeCommand = "publish" | "archive" | "unarchive";
export type NoticeCommandResult = NoticeWriteResult & {
  result: "PUBLISHED" | "ALREADY_PUBLISHED" | "ARCHIVED" | "ALREADY_ARCHIVED" | "UNARCHIVED";
};

export function noticeCommand(
  eventId: string,
  noticeId: string,
  command: NoticeCommand,
  expectedVersion: number,
): Promise<NoticeCommandResult> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/notices/${noticeId}/${command}`, {
    method: "POST",
    body: { expectedVersion },
  }).then((value) => {
    const base = parseWriteResult(value);
    const result = (value as Record<string, unknown>).result;
    if (
      result !== "PUBLISHED" &&
      result !== "ALREADY_PUBLISHED" &&
      result !== "ARCHIVED" &&
      result !== "ALREADY_ARCHIVED" &&
      result !== "UNARCHIVED"
    ) {
      throw unexpected();
    }
    return { ...base, result };
  });
}

/** The `409 CONFLICT` with `reason: PIN_LIMIT`: ids of the pinned published notices, newest first. */
export function pinLimitIds(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== "CONFLICT" || error.extensions.reason !== "PIN_LIMIT") return null;
  const ids = error.extensions.pinnedNoticeIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/** Who changed the notice first, from the `409 CONCURRENT_MODIFICATION` summary (no title or body). */
export function conflictEditor(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== "CONCURRENT_MODIFICATION") return null;
  const notice = error.extensions.notice;
  if (!isRecord(notice)) return null;
  return typeof notice.updatedByDisplayName === "string" ? notice.updatedByDisplayName : null;
}

// ---------------------------------------------------------------------------------------------
// Participant (GET /api/v1/participant/notices…). No author name and no raw audience: only
// `leadersOnly`. Reading a detail does not mark it read; the screen calls markNoticeRead.

export type ParticipantNotice = {
  noticeId: string;
  title: string;
  bodyPreview: string;
  important: boolean;
  pinned: boolean;
  leadersOnly: boolean;
  publishedAt: string;
  editedAt: string | null;
  unread: boolean;
};

export type ParticipantNoticeDetail = ParticipantNotice & { body: string };

export type ParticipantNoticePage = { items: ParticipantNotice[]; nextBefore: string | null };

export function listParticipantNotices(
  query: { before?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ParticipantNoticePage> {
  return apiRequest<unknown>("/api/v1/participant/notices", {
    query: { before: query.before, limit: query.limit },
    signal,
  }).then((value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) throw unexpected();
    return {
      items: value.items.map(parseParticipantNotice),
      nextBefore: typeof value.nextBefore === "string" ? value.nextBefore : null,
    };
  });
}

export function getParticipantNotice(noticeId: string, signal?: AbortSignal): Promise<ParticipantNoticeDetail> {
  return apiRequest<unknown>(`/api/v1/participant/notices/${noticeId}`, { signal }).then((value) => {
    const item = parseParticipantNotice(value);
    const body = (value as Record<string, unknown>).body;
    if (typeof body !== "string") throw unexpected();
    return { ...item, body };
  });
}

/** Marks every notification that points at this notice as read. Returns the new unread count. */
export function markNoticeRead(noticeId: string): Promise<{ unreadCount: number }> {
  return apiRequest<unknown>("/api/v1/participant/notifications/read", {
    method: "POST",
    body: { target: { type: "NOTICE", id: noticeId } },
  }).then((value) => ({
    unreadCount: isRecord(value) && typeof value.unreadCount === "number" ? value.unreadCount : 0,
  }));
}

// ---------------------------------------------------------------------------------------------

function parseWriteResult(value: unknown): NoticeWriteResult {
  if (!isRecord(value)) throw unexpected();
  return {
    notice: parseOperatorNotice(value.notice),
    notifiedCount: typeof value.notifiedCount === "number" ? value.notifiedCount : 0,
  };
}

function parseOperatorNotice(value: unknown): OperatorNotice {
  if (
    !isRecord(value) ||
    typeof value.noticeId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.body !== "string" ||
    typeof value.version !== "number" ||
    !isStatus(value.status)
  ) {
    throw unexpected();
  }
  return {
    noticeId: value.noticeId,
    title: value.title,
    body: value.body,
    important: value.important === true,
    pinned: value.pinned === true,
    audience: audienceOf(value.audience),
    status: value.status,
    version: value.version,
    firstPublishedAt: text(value.firstPublishedAt),
    publishedAt: text(value.publishedAt),
    editedAt: text(value.editedAt),
    archivedAt: text(value.archivedAt),
    createdByDisplayName: text(value.createdByDisplayName),
    updatedByDisplayName: text(value.updatedByDisplayName),
    updatedAt: text(value.updatedAt),
  };
}

function parseParticipantNotice(value: unknown): ParticipantNotice {
  if (
    !isRecord(value) ||
    typeof value.noticeId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.publishedAt !== "string"
  ) {
    throw unexpected();
  }
  return {
    noticeId: value.noticeId,
    title: value.title,
    bodyPreview: typeof value.bodyPreview === "string" ? value.bodyPreview : "",
    important: value.important === true,
    pinned: value.pinned === true,
    leadersOnly: value.leadersOnly === true,
    publishedAt: value.publishedAt,
    editedAt: text(value.editedAt),
    unread: value.unread === true,
  };
}

function audienceOf(value: unknown): NoticeAudienceType {
  const type = Array.isArray(value) && isRecord(value[0]) ? value[0].type : undefined;
  return type === "LEADERS" || type === "STAFF" ? type : "ALL";
}

function isStatus(value: unknown): value is NoticeStatus {
  return value === "DRAFT" || value === "PUBLISHED" || value === "ARCHIVED";
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function unexpected(): ApiError {
  return new ApiError({ status: 200, code: "UNEXPECTED" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
