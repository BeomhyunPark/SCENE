import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * One operator notification (DEC-080 §7.1, #436). `kind` is a §7.2 value; a kind the screen does not
 * know shows its title and body and cannot be opened. `count` is how many were merged (1 by default).
 */
export type OperatorNotification = {
  notificationId: string;
  seq: number;
  kind: string;
  target: { type: string; id: string | null };
  title: string;
  body: string | null;
  important: boolean;
  count: number;
  createdAt: string;
  readAt: string | null;
};

export type NotificationPage = {
  items: OperatorNotification[];
  unreadCount: number;
  /** Pass as `before` for the next page; null when there is none. */
  nextBefore: number | null;
};

/** `GET …/events/{eventId}/updates`: values to compare, not content. */
export type OperatorUpdates = {
  notifications: { latestSeq: number; unreadCount: number };
  notices: number;
  schedule: number;
  checkIns: number;
  pollAfterSeconds: number;
  serverTime: string;
};

export type NotificationReadBody =
  | { notificationIds: string[] }
  | { target: { type: string; id: string } }
  | { upToSeq: number };

/** The unread count stops at 100 on the server; the badge shows "99+" above 99. */
export function badgeText(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 99 ? "99+" : String(unread);
}

export function getOperatorUpdates(eventId: string, signal?: AbortSignal): Promise<OperatorUpdates> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/updates`, { signal }).then(parseUpdates);
}

export function listOperatorNotifications(
  eventId: string,
  before: number | null,
  signal?: AbortSignal,
): Promise<NotificationPage> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/notifications`, {
    query: { before: before ?? undefined, limit: 30 },
    signal,
  }).then(parsePage);
}

export function markOperatorNotificationsRead(eventId: string, body: NotificationReadBody): Promise<number> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/notifications/read`, {
    method: "POST",
    body,
  }).then((value) => {
    if (!isRecord(value) || typeof value.unreadCount !== "number") throw new ApiError({ status: 200, code: "UNEXPECTED" });
    return value.unreadCount;
  });
}

function parseUpdates(value: unknown): OperatorUpdates {
  if (!isRecord(value) || !isRecord(value.notifications)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
  const n = value.notifications;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    notifications: { latestSeq: num(n.latestSeq), unreadCount: num(n.unreadCount) },
    notices: num(value.notices),
    schedule: num(value.schedule),
    checkIns: num(value.checkIns),
    pollAfterSeconds: typeof value.pollAfterSeconds === "number" && value.pollAfterSeconds > 0 ? value.pollAfterSeconds : 15,
    serverTime: typeof value.serverTime === "string" ? value.serverTime : "",
  };
}

function parsePage(value: unknown): NotificationPage {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
  const items: OperatorNotification[] = [];
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.notificationId !== "string" ||
      typeof item.seq !== "number" ||
      typeof item.kind !== "string" ||
      typeof item.title !== "string" ||
      typeof item.createdAt !== "string"
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    const target = isRecord(item.target) ? item.target : {};
    items.push({
      notificationId: item.notificationId,
      seq: item.seq,
      kind: item.kind,
      target: {
        type: typeof target.type === "string" ? target.type : "",
        id: typeof target.id === "string" ? target.id : null,
      },
      title: item.title,
      body: typeof item.body === "string" ? item.body : null,
      important: item.important === true,
      count: typeof item.count === "number" && item.count > 0 ? item.count : 1,
      createdAt: item.createdAt,
      readAt: typeof item.readAt === "string" ? item.readAt : null,
    });
  }
  return {
    items,
    unreadCount: typeof value.unreadCount === "number" ? value.unreadCount : 0,
    nextBefore: typeof value.nextBefore === "number" ? value.nextBefore : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
