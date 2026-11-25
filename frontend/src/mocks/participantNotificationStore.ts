/**
 * Participant notifications in the mock (DEC-080 §7, B5 #463), shaped like the server's
 * `notifications` rows for `recipient_kind = PARTICIPANT`: per participant, newest `seq` first,
 * merged while unread (same kind and target → one row with `count + 1` and a new `seq`). Notices,
 * the schedule, group and room publications all write here, so `updates.notifications`, the inbox,
 * the notice list's `unread` and `POST /participant/notifications/read` agree. Titles and bodies are
 * never logged.
 */
export type ParticipantNotificationDraft = {
  kind: string;
  target: { type: string; id: string | null };
  title: string;
  body: string | null;
  important?: boolean;
};

type Row = {
  notificationId: string;
  seq: number;
  eventId: string;
  participantId: string;
  kind: string;
  target: { type: string; id: string | null };
  title: string;
  body: string | null;
  important: boolean;
  count: number;
  createdAt: string;
  readAt: string | null;
};

export type ParticipantNotificationFailure = { status: 400; code: "VALIDATION_FAILED"; errors: { field: string }[] };

let rows: Row[] = [];
let seq = 0;

export function resetParticipantNotificationStore(): void {
  rows = [];
  seq = 0;
}

/** One row per participant id, like `Notifications.toParticipants`. Returns rows made. */
export function notifyParticipants(eventId: string, participantIds: Iterable<string>, draft: ParticipantNotificationDraft): number {
  const now = new Date().toISOString();
  let made = 0;
  for (const participantId of new Set(participantIds)) {
    const merged = rows.find(
      (row) =>
        row.participantId === participantId &&
        row.eventId === eventId &&
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
      participantId,
      kind: draft.kind,
      target: { ...draft.target },
      title: [...draft.title].slice(0, 80).join(""),
      body: draft.body ? [...draft.body].slice(0, 200).join("") : null,
      important: draft.important === true,
      count: (merged?.count ?? 0) + 1,
      createdAt: now,
      readAt: null,
    });
    made += 1;
  }
  return made;
}

function own(participantId: string): Row[] {
  return rows.filter((row) => row.participantId === participantId).sort((a, b) => b.seq - a.seq);
}

/** Whether the participant has an unread row pointing at this target (the notice list's `unread`). */
export function hasUnreadTarget(participantId: string, type: string, id: string): boolean {
  return rows.some((row) => row.participantId === participantId && row.target.type === type && row.target.id === id && !row.readAt);
}

/** Every recipient's unread rows for one target become read (an archived notice). */
export function markTargetReadForAll(type: string, id: string): void {
  const at = new Date().toISOString();
  for (const row of rows) if (row.target.type === type && row.target.id === id && !row.readAt) row.readAt = at;
}

/** Test seam: how many rows of a kind a participant has. */
export function participantNotificationCount(participantId: string, kind: string): number {
  return rows.filter((row) => row.participantId === participantId && row.kind === kind).length;
}

/** For `updates.notifications`. */
export function participantNotificationSummary(participantId: string): { latestSeq: number; unreadCount: number } {
  const mine = own(participantId);
  return { latestSeq: mine[0]?.seq ?? 0, unreadCount: Math.min(100, mine.filter((row) => !row.readAt).length) };
}

/** `GET /participant/notifications`: newest first, `before` a `seq`, `limit` 1–50 (default 30). */
export function participantNotificationPage(participantId: string, search: URLSearchParams) {
  const beforeText = search.get("before");
  const limitText = search.get("limit");
  const before = beforeText === null ? null : Number(beforeText);
  const limit = limitText === null ? 30 : Number(limitText);
  if (before !== null && (!Number.isInteger(before) || before < 1)) return failure("before");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return failure("limit");
  const list = own(participantId).filter((row) => before === null || row.seq < before);
  const items = list.slice(0, limit).map((row) => ({
    notificationId: row.notificationId,
    seq: row.seq,
    kind: row.kind,
    target: { ...row.target },
    title: row.title,
    body: row.body,
    important: row.important,
    count: row.count,
    createdAt: row.createdAt,
    readAt: row.readAt,
  }));
  return {
    items,
    unreadCount: participantNotificationSummary(participantId).unreadCount,
    nextBefore: list.length > limit ? items[items.length - 1].seq : null,
  };
}

/** `POST /participant/notifications/read`: exactly one of `notificationIds`, `target`, `upToSeq`. */
export function readParticipantNotifications(
  participantId: string,
  input: unknown,
): { unreadCount: number } | ParticipantNotificationFailure {
  const body = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!body) return failure("body");
  const keys = ["notificationIds", "target", "upToSeq"].filter((key) => key in body);
  if (keys.length !== 1) return failure("body");
  const at = new Date().toISOString();
  const mine = own(participantId).filter((row) => !row.readAt);
  if (keys[0] === "notificationIds") {
    const ids = body.notificationIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || !ids.every((id) => typeof id === "string")) {
      return failure("notificationIds");
    }
    for (const row of mine) if (ids.includes(row.notificationId)) row.readAt = at;
  } else if (keys[0] === "target") {
    const target = body.target as Record<string, unknown> | null;
    if (!target || typeof target.type !== "string" || !("id" in target) || (target.id !== null && typeof target.id !== "string")) {
      return failure("target");
    }
    for (const row of mine) if (row.target.type === target.type && row.target.id === target.id) row.readAt = at;
  } else {
    const upTo = body.upToSeq;
    if (typeof upTo !== "number" || !Number.isInteger(upTo) || upTo < 1) return failure("upToSeq");
    for (const row of mine) if (row.seq <= upTo) row.readAt = at;
  }
  return { unreadCount: participantNotificationSummary(participantId).unreadCount };
}

function failure(field: string): ParticipantNotificationFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field }] };
}
