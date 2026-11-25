import { localUsers } from "./fixtures/seed";
import { requireEventRead } from "./formStore";
import { boardSlotsOf, groupPeople, readParticipantGroup } from "./groupStore";
import { eventById } from "./operatorStore";
import { bumpFeed } from "./participantFeedStore";
import { permissionsFor } from "./taskStore";

/**
 * Shaped like the schedule server (#435, api.md "일정표", DEC-081 and its Follow-up): a working copy of
 * items, publications that snapshot it, "저장하고 바로 공개" with the other-changes confirmation, change
 * marks merged within 24 hours, removed items for 24 hours, and the participant read filtered by audience.
 * A publish raises `updates.schedule` by exactly one.
 */
export type ScheduleFailure = { status: number; code: string; [key: string]: unknown };

type Audience = "ALL" | "LEADERS" | "STAFF";
type Content = {
  day: number;
  startTime: string;
  endTime: string | null;
  title: string;
  place: string | null;
  description: string | null;
  category: string;
  audience: Audience;
  slotId: string | null;
  sortOrder: number;
};
type Item = Content & { itemId: string; version: number; updatedAt: string; updatedBy: string };
type Change = { kind: "ADDED" | "CHANGED"; changedAt: string; fields: string[]; previous: Record<string, unknown> | null };
type SnapItem = Content & { itemId: string; change: Change | null };
type Removed = { itemId: string; day: number; title: string; startTime: string; audience: Audience; removedAt: string };
type Publication = { publicationId: string; publishedAt: string; publishedBy: string; boardVersion: number; items: SnapItem[]; removedItems: Removed[] };
type Board = { version: number; items: Item[]; publications: Publication[] };

const COMPARE: (keyof Content)[] = ["day", "startTime", "endTime", "title", "place", "description", "category", "audience", "slotId", "sortOrder"];
const PREVIOUS: (keyof Content)[] = ["day", "startTime", "endTime", "place"];
const CATEGORIES = ["WORSHIP", "MEAL", "PROGRAM", "GROUP", "FREE", "MOVE", "OTHER"];
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

let boards = new Map<string, Board>();

export function resetScheduleStore(): void {
  boards = new Map();
}

function boardOf(eventId: string): Board {
  let board = boards.get(eventId);
  if (!board) boards.set(eventId, (board = { version: 0, items: [], publications: [] }));
  return board;
}

/** Test and mock-click seam: give the event a period (the seed event has none). */
export function setSchedulePeriod(eventId: string, startDate: string | null, endDate: string | null): void {
  const event = eventById(eventId);
  if (!event) return;
  event.startDate = startDate;
  event.endDate = endDate;
}

/** Test seam: an item written by another operator (no permission check). Returns its id. */
export function seedScheduleItem(eventId: string, input: Partial<Content> & { day: number; startTime: string; title: string }): string {
  const board = boardOf(eventId);
  const item: Item = {
    endTime: null,
    place: null,
    description: null,
    category: "PROGRAM",
    audience: "ALL",
    slotId: null,
    sortOrder: nextSort(board, input.day, input.startTime),
    ...input,
    itemId: crypto.randomUUID(),
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: localUsers[1].userId,
  };
  board.items.push(item);
  board.version += 1;
  return item.itemId;
}

/** Test seam: another operator changed an item (its version rises). */
export function editAsOtherOperator(eventId: string, itemId: string, patch: Partial<Content>): void {
  const board = boardOf(eventId);
  const item = board.items.find((entry) => entry.itemId === itemId);
  if (!item) return;
  Object.assign(item, patch);
  item.version += 1;
  item.updatedBy = localUsers[1].userId;
  board.version += 1;
}

/** Test seam: publish as another operator. */
export function publishAsOtherOperator(eventId: string, now = new Date()): void {
  publishNow(eventId, localUsers[1].userId, true, now);
}

/** The working copy's `boardVersion`, which the operator `updates.schedule` carries (I3). */
export function scheduleBoardVersion(eventId: string): number {
  return boardOf(eventId).version;
}

/** `HH:mm` start time by slot id of the working-copy items tied to a slot (the server's ScheduleSlotTimes). */
export function scheduleSlotStartTimes(eventId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of boardOf(eventId).items) if (item.slotId) out.set(item.slotId, item.startTime);
  return out;
}

export function scheduleItemIds(eventId: string): string[] {
  return boardOf(eventId).items.map((item) => item.itemId);
}

// ---- reads ----

function daysOf(eventId: string): { day: number; date: string; dayLabel: string }[] {
  const event = eventById(eventId);
  if (!event?.startDate) return [];
  const start = new Date(`${event.startDate}T00:00:00Z`);
  const end = event.endDate ? new Date(`${event.endDate}T00:00:00Z`) : start;
  const days = [];
  for (let at = start, day = 1; at <= end && day <= 10; at = new Date(at.getTime() + DAY_MS), day += 1) {
    days.push({ day, date: at.toISOString().slice(0, 10), dayLabel: `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 (${WEEKDAYS[at.getUTCDay()]})` });
  }
  return days;
}

function dateOf(eventId: string, day: number): string | null {
  const event = eventById(eventId);
  if (!event?.startDate) return null;
  return new Date(Date.parse(`${event.startDate}T00:00:00Z`) + (day - 1) * DAY_MS).toISOString().slice(0, 10);
}

function times(eventId: string, content: Pick<Content, "day" | "startTime" | "endTime">) {
  const date = dateOf(eventId, content.day);
  const endsNextDay = content.endTime !== null && content.endTime < content.startTime;
  const endDate = date && endsNextDay ? new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10) : date;
  return {
    date,
    endsNextDay,
    startsAt: date ? `${date}T${content.startTime}:00+09:00` : null,
    endsAt: date && content.endTime ? `${endDate}T${content.endTime}:00+09:00` : null,
  };
}

function ordered<T extends Content & { itemId: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId),
  );
}

function sameContent(a: Content, b: Content): boolean {
  return COMPARE.every((key) => a[key] === b[key]);
}

function contentOf(item: Content): Content {
  return Object.fromEntries(COMPARE.map((key) => [key, item[key]])) as Content;
}

function displayName(userId: string): string {
  return localUsers.find((user) => user.userId === userId)?.displayName ?? "운영자";
}

function pending(board: Board, exceptItemId: string | null = null) {
  const latest = board.publications.at(-1);
  const items = board.items.filter((item) => item.itemId !== exceptItemId);
  const snapshot = new Map((latest?.items ?? []).map((item) => [item.itemId, item]));
  const added = items.filter((item) => !snapshot.has(item.itemId));
  const changed = items.filter((item) => {
    const before = snapshot.get(item.itemId);
    return before !== undefined && !sameContent(before, item);
  });
  const workingIds = new Set(board.items.map((item) => item.itemId));
  const removed = (latest?.items ?? []).filter((item) => !workingIds.has(item.itemId) && item.itemId !== exceptItemId);
  return {
    added,
    changed: changed.map((item) => ({ item, fields: COMPARE.filter((key) => snapshot.get(item.itemId)![key] !== item[key]) })),
    removed,
  };
}

function outOfPeriod(eventId: string, day: number): boolean {
  const count = daysOf(eventId).length;
  return count === 0 || day > count;
}

function operatorItem(eventId: string, board: Board, item: Item) {
  const latest = board.publications.at(-1);
  const published = latest?.items.find((entry) => entry.itemId === item.itemId);
  return {
    itemId: item.itemId,
    ...contentOf(item),
    ...times(eventId, item),
    audience: [{ type: item.audience }],
    leadersOnly: item.audience === "LEADERS",
    version: item.version,
    updatedAt: item.updatedAt,
    updatedByDisplayName: displayName(item.updatedBy),
    publishState: !published ? "ADDED" : sameContent(published, item) ? "UNCHANGED" : "CHANGED",
    outOfPeriod: outOfPeriod(eventId, item.day),
  };
}

export function readScheduleBoard(eventId: string, actorId: string) {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate as ScheduleFailure;
  const event = eventById(eventId)!;
  const board = boardOf(eventId);
  const latest = board.publications.at(-1);
  const diff = pending(board);
  const slots = boardSlotsOf(eventId);
  return {
    eventStatus: event.lifecycleStatus,
    boardVersion: board.version,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
    timeZone: "Asia/Seoul",
    days: daysOf(eventId),
    items: ordered(board.items).map((item) => operatorItem(eventId, board, item)),
    publication: {
      lastPublishedAt: latest?.publishedAt ?? null,
      lastPublishedByDisplayName: latest ? displayName(latest.publishedBy) : null,
      lastPublishedBoardVersion: latest?.boardVersion ?? null,
      hasUnpublishedChanges: !latest || diff.added.length + diff.changed.length + diff.removed.length > 0,
      pendingChanges: { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length },
    },
    slots: slots
      ? slots.map((slot) => ({ ...slot, linkedItemId: board.items.find((item) => item.slotId === slot.slotId)?.itemId ?? null }))
      : null,
  };
}

/** GET /participant/schedule for one participant, filtered by audience; marks older than 24 hours are dropped. */
export function readParticipantSchedule(eventId: string, participantId: string, now = new Date()) {
  const base = { timeZone: "Asia/Seoul", serverTime: now.toISOString(), days: daysOf(eventId), publishedAt: null, items: [], removedItems: [] };
  const group = readParticipantGroup(eventId, participantId);
  if (group.status === "NOT_ELIGIBLE") return { status: "NOT_ELIGIBLE", ...base };
  const latest = boardOf(eventId).publications.at(-1);
  if (!latest) return { status: "NOT_PUBLISHED", ...base };
  const sees = (audience: Audience) => audience === "ALL" || (audience === "LEADERS" && group.leader);
  const fresh = (at: string) => now.getTime() - Date.parse(at) < DAY_MS;
  return {
    ...base,
    status: "PUBLISHED",
    publishedAt: latest.publishedAt,
    items: ordered(latest.items.filter((item) => sees(item.audience))).map((item) => {
      const { audience, change, ...content } = item;
      return {
        ...content,
        ...times(eventId, item),
        leadersOnly: audience === "LEADERS",
        change: change && fresh(change.changedAt) ? change : null,
      };
    }),
    removedItems: latest.removedItems
      .filter((item) => sees(item.audience) && fresh(item.removedAt))
      .map((item) => ({
        itemId: item.itemId,
        day: item.day,
        date: dateOf(eventId, item.day),
        title: item.title,
        startTime: item.startTime,
        removedAt: item.removedAt,
      })),
  };
}

// ---- writes ----

type PublishFlags = { publish: boolean; confirmOtherChanges: boolean; notify: boolean };

function writeGate(eventId: string, actorId: string): ScheduleFailure | null {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms as ScheduleFailure;
  if (!perms.effective.includes("SCHEDULE_WRITE")) return { status: 403, code: "FORBIDDEN" };
  return null;
}

function stateGate(eventId: string): ScheduleFailure | null {
  const status = eventById(eventId)!.lifecycleStatus;
  if (status === "ENDED") return { status: 409, code: "EVENT_ENDED" };
  if (status === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  return null;
}

function field(name: string): ScheduleFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}

function flagsOf(source: Record<string, unknown>): PublishFlags | ScheduleFailure {
  const read = (key: string, fallback: boolean) => {
    const value = source[key];
    if (value === undefined) return fallback;
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return null;
  };
  const publish = read("publish", false);
  const confirmOtherChanges = read("confirmOtherChanges", false);
  const notify = read("notify", true);
  if (publish === null) return field("publish");
  if (confirmOtherChanges === null) return field("confirmOtherChanges");
  if (notify === null) return field("notify");
  return { publish, confirmOtherChanges, notify };
}

/** Normalises the fields present in `body` over `base`; returns a failure for the first bad field. */
function merge(eventId: string, base: Content, body: Record<string, unknown>, creating: boolean): Content | ScheduleFailure {
  const next = { ...base };
  const text = (key: "place" | "description", max: number) => {
    if (!(key in body)) return null;
    const value = body[key];
    if (value === null) return ((next[key] = null), null);
    if (typeof value !== "string" || value.trim().length > max) return field(key);
    next[key] = value.trim() || null;
    return null;
  };
  if ("day" in body || creating) {
    if (typeof body.day !== "number" || !Number.isInteger(body.day) || body.day < 1) return field("day");
    next.day = body.day;
  }
  if ("startTime" in body || creating) {
    if (typeof body.startTime !== "string" || !TIME.test(body.startTime)) return field("startTime");
    next.startTime = body.startTime;
  }
  if ("endTime" in body) {
    if (body.endTime !== null && (typeof body.endTime !== "string" || !TIME.test(body.endTime))) return field("endTime");
    next.endTime = body.endTime as string | null;
  }
  if ("title" in body || creating) {
    if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.trim().length > 100) return field("title");
    next.title = body.title.trim();
  }
  const placeFailure = text("place", 100) ?? text("description", 2000);
  if (placeFailure) return placeFailure;
  if ("category" in body || creating) {
    if (typeof body.category !== "string" || !CATEGORIES.includes(body.category)) return field("category");
    next.category = body.category;
  }
  if ("audience" in body || creating) {
    const list = body.audience;
    if (!Array.isArray(list) || list.length !== 1 || typeof list[0] !== "object" || list[0] === null) return field("audience");
    const entry = list[0] as Record<string, unknown>;
    if (Object.keys(entry).length !== 1 || !["ALL", "LEADERS", "STAFF"].includes(entry.type as string)) return field("audience");
    next.audience = entry.type as Audience;
  }
  if ("slotId" in body) {
    if (body.slotId !== null && typeof body.slotId !== "string") return field("slotId");
    next.slotId = body.slotId as string | null;
  }
  if (!creating && "sortOrder" in body) {
    if (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 100_000) return field("sortOrder");
    next.sortOrder = body.sortOrder;
  }
  if (next.endTime === next.startTime) return field("endTime");
  if (next.slotId !== null) {
    const match = /^opt_d(\d+)_(breakfast|lunch|dinner|worship)$/.exec(next.slotId);
    if (!match || Number(match[1]) !== next.day) return field("slotId");
    const meal = match[2] === "worship" ? "WORSHIP" : "MEAL";
    if (next.category !== meal) return field("slotId");
  }
  if (("day" in body || creating) && outOfPeriod(eventId, next.day)) return field("day");
  return next;
}

function nextSort(board: Board, day: number, startTime: string, exceptItemId: string | null = null): number {
  const same = board.items.filter((item) => item.day === day && item.startTime === startTime && item.itemId !== exceptItemId);
  return same.length === 0 ? 0 : Math.max(...same.map((item) => item.sortOrder)) + 1;
}

function confirmation(board: Board, exceptItemId: string | null): ScheduleFailure | null {
  const other = pending(board, exceptItemId);
  const hasOther = board.publications.length === 0
    ? board.items.some((item) => item.itemId !== exceptItemId)
    : other.added.length + other.changed.length + other.removed.length > 0;
  if (!hasOther) return null;
  return {
    status: 409,
    code: "CONFIRMATION_REQUIRED",
    otherChanges: {
      added: other.added.map((item) => ({ itemId: item.itemId, title: item.title })),
      changed: other.changed.map(({ item, fields }) => ({ itemId: item.itemId, title: item.title, fields })),
      removed: other.removed.map((item) => ({ itemId: item.itemId, title: item.title })),
    },
  };
}

/** Runs `write` and, with `publish`, the publish in one "transaction": a failed publish rolls the write back. */
function withPublish(eventId: string, actorId: string, flags: PublishFlags, exceptItemId: string | null, write: () => Item | null, status = 200) {
  const board = boardOf(eventId);
  if (flags.publish && !flags.confirmOtherChanges) {
    const needed = confirmation(board, exceptItemId);
    if (needed) return needed;
  }
  const saved = structuredClone(board);
  const item = write();
  let publication = null;
  if (flags.publish) {
    const result = publishNow(eventId, actorId, flags.notify);
    if ("code" in result) {
      boards.set(eventId, saved);
      return result;
    }
    publication = result;
  }
  return {
    status,
    body: { item: item ? operatorItem(eventId, boardOf(eventId), item) : null, boardVersion: boardOf(eventId).version, publication },
  };
}

export function createScheduleItem(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  if (!isRecord(body)) return field("body");
  const flags = flagsOf(body);
  if ("code" in flags) return flags;
  const state = stateGate(eventId);
  if (state) return state;
  if (daysOf(eventId).length === 0) return { status: 409, code: "CONFLICT", reason: "EVENT_PERIOD_REQUIRED" };
  const empty: Content = { day: 1, startTime: "00:00", endTime: null, title: "", place: null, description: null, category: "OTHER", audience: "ALL", slotId: null, sortOrder: 0 };
  const content = merge(eventId, empty, body, true);
  if ("code" in content) return content;
  const board = boardOf(eventId);
  if (content.slotId && board.items.some((item) => item.slotId === content.slotId)) return { status: 409, code: "CONFLICT", reason: "SLOT_ALREADY_LINKED" };
  if (board.items.length >= 300) return { status: 409, code: "CONFLICT", reason: "ITEM_LIMIT" };
  return withPublish(eventId, actorId, flags, "__new__", () => {
    const target = boardOf(eventId);
    const item: Item = {
      ...content,
      sortOrder: nextSort(target, content.day, content.startTime),
      itemId: crypto.randomUUID(),
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };
    target.items.push(item);
    target.version += 1;
    return item;
  }, 201);
}

export function updateScheduleItem(eventId: string, itemId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  if (!isRecord(body)) return field("body");
  if (typeof body.expectedVersion !== "number" || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 1) return field("expectedVersion");
  const flags = flagsOf(body);
  if ("code" in flags) return flags;
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const found = board.items.find((item) => item.itemId === itemId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (found.version !== body.expectedVersion) {
    return { status: 409, code: "CONCURRENT_MODIFICATION", item: operatorItem(eventId, board, found) };
  }
  const content = merge(eventId, contentOf(found), body, false);
  if ("code" in content) return content;
  if (content.slotId && board.items.some((item) => item.slotId === content.slotId && item.itemId !== itemId)) {
    return { status: 409, code: "CONFLICT", reason: "SLOT_ALREADY_LINKED" };
  }
  if ((content.day !== found.day || content.startTime !== found.startTime) && !("sortOrder" in body)) {
    content.sortOrder = nextSort(board, content.day, content.startTime, itemId);
  }
  return withPublish(eventId, actorId, flags, itemId, () => {
    const target = boardOf(eventId).items.find((item) => item.itemId === itemId)!;
    if (sameContent(target, content)) return target;
    Object.assign(target, content);
    target.version += 1;
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actorId;
    boardOf(eventId).version += 1;
    return target;
  });
}

export function deleteScheduleItem(eventId: string, itemId: string, actorId: string, url: URL) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  const raw = url.searchParams.get("expectedVersion");
  const expected = raw === null ? Number.NaN : Number(raw);
  if (!Number.isInteger(expected) || expected < 1) return field("expectedVersion");
  const flags = flagsOf(Object.fromEntries(url.searchParams.entries()));
  if ("code" in flags) return flags;
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  const found = board.items.find((item) => item.itemId === itemId);
  if (!found) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (found.version !== expected) return { status: 409, code: "CONCURRENT_MODIFICATION", item: operatorItem(eventId, board, found) };
  const result = withPublish(eventId, actorId, flags, itemId, () => {
    const target = boardOf(eventId);
    target.items = target.items.filter((item) => item.itemId !== itemId);
    target.version += 1;
    return null;
  });
  if ("body" in result) {
    const body = result.body as { boardVersion: number; publication: unknown };
    return { status: 200, body: { boardVersion: body.boardVersion, publication: body.publication } };
  }
  return result;
}

export function publishSchedule(eventId: string, actorId: string, body: unknown) {
  const gate = writeGate(eventId, actorId);
  if (gate) return gate;
  if (!isRecord(body)) return field("body");
  if (typeof body.expectedBoardVersion !== "number" || !Number.isInteger(body.expectedBoardVersion) || body.expectedBoardVersion < 0) {
    return field("expectedBoardVersion");
  }
  const flags = flagsOf(body);
  if ("code" in flags) return flags;
  const state = stateGate(eventId);
  if (state) return state;
  const board = boardOf(eventId);
  if (board.version !== body.expectedBoardVersion) return { status: 409, code: "CONCURRENT_MODIFICATION", boardVersion: board.version };
  const result = publishNow(eventId, actorId, flags.notify);
  return "code" in result ? result : { status: 200, body: result };
}

function publishNow(eventId: string, actorId: string, notify: boolean, now = new Date()) {
  const board = boardOf(eventId);
  const latest = board.publications.at(-1);
  const diff = pending(board);
  if (latest && diff.added.length + diff.changed.length + diff.removed.length === 0) {
    return {
      result: "ALREADY_PUBLISHED",
      publicationId: latest.publicationId,
      publishedAt: latest.publishedAt,
      boardVersion: board.version,
      changes: { added: [], changed: [], removed: [] },
      notifiedCount: 0,
    };
  }
  if (daysOf(eventId).length === 0) return { status: 409, code: "CONFLICT", reason: "EVENT_PERIOD_REQUIRED" } as ScheduleFailure;
  const outside = board.items.filter((item) => outOfPeriod(eventId, item.day)).map((item) => item.itemId);
  if (outside.length > 0) return { status: 409, code: "CONFLICT", reason: "ITEMS_OUT_OF_PERIOD", itemIds: outside } as ScheduleFailure;

  const at = now.toISOString();
  const fresh = (value: string) => now.getTime() - Date.parse(value) < DAY_MS;
  const before = new Map((latest?.items ?? []).map((item) => [item.itemId, item]));
  const items: SnapItem[] = board.items.map((item) => {
    const content = contentOf(item);
    return { ...content, itemId: item.itemId, change: latest ? changeOf(before.get(item.itemId), content, at, fresh) : null };
  });
  const keptRemoved = (latest?.removedItems ?? []).filter((item) => fresh(item.removedAt) && !board.items.some((entry) => entry.itemId === item.itemId));
  const newlyRemoved: Removed[] = diff.removed.map((item) => ({
    itemId: item.itemId,
    day: item.day,
    title: item.title,
    startTime: item.startTime,
    audience: item.audience,
    removedAt: at,
  }));
  const publication: Publication = {
    publicationId: crypto.randomUUID(),
    publishedAt: at,
    publishedBy: actorId,
    boardVersion: board.version,
    items,
    removedItems: [...keptRemoved, ...newlyRemoved],
  };
  board.publications.push(publication);
  bumpFeed(eventId, "schedule");
  const changes = {
    added: diff.added.map((item) => ({ itemId: item.itemId, title: item.title })),
    changed: diff.changed.map(({ item, fields }) => ({ itemId: item.itemId, title: item.title, fields })),
    removed: diff.removed.map((item) => ({ itemId: item.itemId, title: item.title })),
  };
  const touched = [...diff.added, ...diff.changed.map((entry) => entry.item), ...diff.removed];
  const reachesEveryone = touched.some((item) => item.audience === "ALL") || (!latest && board.items.some((item) => item.audience === "ALL"));
  return {
    result: "PUBLISHED",
    publicationId: publication.publicationId,
    publishedAt: at,
    boardVersion: board.version,
    changes,
    notifiedCount: notify && reachesEveryone ? groupPeople(eventId).length : 0,
  };
}

/** The change mark of one item against the previous publication, merged with a mark younger than 24 hours. */
function changeOf(before: SnapItem | undefined, next: Content, at: string, fresh: (value: string) => boolean): Change | null {
  if (!before) return { kind: "ADDED", changedAt: at, fields: [], previous: null };
  const diff = COMPARE.filter((key) => before[key] !== next[key]);
  const old = before.change && fresh(before.change.changedAt) ? before.change : null;
  if (old?.kind === "ADDED") return diff.length > 0 ? { ...old, changedAt: at } : old;
  if (!old && diff.length === 0) return null;
  const previous: Record<string, unknown> = { ...(old?.previous ?? {}) };
  const fields = new Set(old?.fields ?? []);
  for (const key of diff) {
    fields.add(key);
    if (PREVIOUS.includes(key) && !(key in previous)) previous[key] = before[key];
  }
  for (const key of Object.keys(previous)) {
    if (previous[key] === next[key as keyof Content]) {
      delete previous[key];
      fields.delete(key);
    }
  }
  if (fields.size === 0) return null;
  return {
    kind: "CHANGED",
    changedAt: diff.length > 0 ? at : old!.changedAt,
    fields: COMPARE.filter((key) => fields.has(key)),
    previous,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
