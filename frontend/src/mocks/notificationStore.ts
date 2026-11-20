import { eventOperatorIds, permissionsFor } from "./taskStore";

/**
 * Operator notifications in the mock (DEC-080 §7, #436), shaped like the server's `notifications`
 * rows: per recipient, newest `seq` first, merged while unread (same kind and target → one row with
 * `count + 1` and a new `seq`).
 */
export type MockNotification = {
  notificationId: string;
  seq: number;
  eventId: string;
  userId: string;
  kind: string;
  target: { type: string; id: string | null };
  title: string;
  body: string | null;
  important: boolean;
  count: number;
  createdAt: string;
  readAt: string | null;
};

let rows: MockNotification[] = [];
let seq = 0;
let checkInSeq = new Map<string, number>();

export function resetNotificationStore(): void {
  rows = [];
  seq = 0;
  checkInSeq = new Map();
}

/** Operators of the event with an effective permission, like `OperatorRecipients.withPermission`. */
export function operatorsWith(eventId: string, permission: string, except: string | null = null): string[] {
  return eventOperatorIds(eventId).filter((userId) => {
    if (userId === except) return false;
    const perms = permissionsFor(eventId, userId, userId);
    return "effective" in perms && perms.effective.includes(permission);
  });
}

export function notifyOperators(
  eventId: string,
  userIds: string[],
  draft: { kind: string; target: { type: string; id: string | null }; title: string; body: string | null; important?: boolean },
): void {
  const now = new Date().toISOString();
  for (const userId of userIds) {
    const merged = rows.find(
      (row) =>
        row.eventId === eventId &&
        row.userId === userId &&
        row.kind === draft.kind &&
        row.target.type === draft.target.type &&
        row.target.id === draft.target.id &&
        row.readAt === null,
    );
    if (merged) rows = rows.filter((row) => row !== merged);
    seq += 1;
    rows.push({
      notificationId: crypto.randomUUID(),
      seq,
      eventId,
      userId,
      kind: draft.kind,
      target: draft.target,
      title: draft.title.slice(0, 80),
      body: draft.body ? draft.body.slice(0, 200) : null,
      important: draft.important === true,
      count: (merged?.count ?? 0) + 1,
      createdAt: now,
      readAt: null,
    });
  }
}

/** Every notification pointing at one of `fromIds` now points at `toId` (a new revision). */
export function retargetNotifications(eventId: string, type: string, fromIds: string[], toId: string): void {
  for (const row of rows) {
    if (row.eventId === eventId && row.target.type === type && row.target.id && fromIds.includes(row.target.id)) {
      row.target = { type, id: toId };
    }
  }
}

function own(eventId: string, userId: string): MockNotification[] {
  return rows.filter((row) => row.eventId === eventId && row.userId === userId).sort((a, b) => b.seq - a.seq);
}

export function unreadCount(eventId: string, userId: string): number {
  return Math.min(100, own(eventId, userId).filter((row) => row.readAt === null).length);
}

export function summaryOf(eventId: string, userId: string): { latestSeq: number; unreadCount: number } {
  return { latestSeq: own(eventId, userId)[0]?.seq ?? 0, unreadCount: unreadCount(eventId, userId) };
}

export function pageOf(
  eventId: string,
  userId: string,
  before: number | null,
  limit: number,
): { items: Omit<MockNotification, "eventId" | "userId">[]; unreadCount: number; nextBefore: number | null } {
  const list = own(eventId, userId).filter((row) => before === null || row.seq < before);
  const items = list.slice(0, limit).map((row) => {
    const item: Partial<MockNotification> = { ...row };
    delete item.eventId;
    delete item.userId;
    return item as Omit<MockNotification, "eventId" | "userId">;
  });
  return {
    items,
    unreadCount: unreadCount(eventId, userId),
    nextBefore: list.length > limit ? items[items.length - 1].seq : null,
  };
}

/** `{ notificationIds }`, `{ target }` or `{ upToSeq }`; null when the body is not one of them. */
export function markRead(eventId: string, userId: string, body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  const keys = ["notificationIds", "target", "upToSeq"].filter((key) => key in input);
  if (keys.length !== 1) return null;
  const now = new Date().toISOString();
  for (const row of own(eventId, userId)) {
    if (row.readAt !== null) continue;
    const ids = Array.isArray(input.notificationIds) ? input.notificationIds : null;
    const target = input.target as { type?: unknown; id?: unknown } | undefined;
    const hit =
      (ids && ids.includes(row.notificationId)) ||
      (target && row.target.type === target.type && row.target.id === target.id) ||
      (typeof input.upToSeq === "number" && row.seq <= input.upToSeq);
    if (hit) row.readAt = now;
  }
  return unreadCount(eventId, userId);
}

/** The event's newest check-in log value for `updates.checkIns`. */
export function bumpCheckIns(eventId: string): void {
  checkInSeq.set(eventId, (checkInSeq.get(eventId) ?? 0) + 1);
}

export function checkInValue(eventId: string): number {
  return checkInSeq.get(eventId) ?? 0;
}
