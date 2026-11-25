import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { LifecycleStatus } from "./events";
import type { ItemPage } from "./types";
import { parseDeskRoom, parseLodging, type DeskRoom, type Lodging } from "./deskRoom";

/**
 * Operator check-in (#282, DEC-071). Reads need EVENT_READ or an active space OWNER·ADMIN. Check-in
 * and cancel need CHECKIN_WRITE and an ACTIVE event and carry an `Idempotency-Key`: one key per operator
 * action, sent again unchanged when that action is retried (#287, components/checkInDelivery.ts). A repeat
 * check-in or cancel is a 200 result, not an error.
 */
export type CheckInStatus = "CHECKED_IN" | "CANCELLED";
export type CheckInMethod = "QR" | "MANUAL";

/**
 * Arrival standing (E4 #456, DEC-087 Follow-up): the meal counts' clock and due slots. OVERDUE is
 * "지금까지 왔어야 하는 사람", the same people as the next meal's 아직 안 옴 on 식수 현황.
 */
export type ArrivalStatus = "ARRIVED" | "OVERDUE" | "COMING" | "PASSED" | "UNKNOWN";

export type ArrivalSlot = { slotId: string; day: number; dayLabel: string; label: string };

/** `slot` is the due slot the status is about; null when unknown or nothing is attended. */
export type RosterArrival = { status: ArrivalStatus; slot: ArrivalSlot | null };

/** Not-checked-in people by standing. `overdue + coming + passed + unknown = notCheckedIn`. */
export type SummaryArrival = {
  asOf: string;
  nextMeal: ArrivalSlot | null;
  overdue: number;
  coming: number;
  passed: number;
  unknown: number;
};

export type CheckInSummary = {
  eventStatus: LifecycleStatus;
  total: number;
  checkedIn: number;
  notCheckedIn: number;
  /** Null when the form has no slot (or an older server). */
  arrival: SummaryArrival | null;
};

export type RosterCheckIn = {
  checkInId: string;
  status: CheckInStatus;
  method: CheckInMethod;
  checkedInAt: string;
  checkedInByDisplayName: string | null;
};

export type RosterItem = {
  participantId: string;
  name: string;
  cohort: string | null;
  /** Room of the latest room publication (G5 #460); null before it, when unassigned, or from an older server. */
  room: DeskRoom | null;
  /** Lodging state now; null from an older server. */
  lodging: Lodging | null;
  /** Only with CHECKIN_WRITE. */
  phoneLast4: string | null;
  checkIn: RosterCheckIn | null;
  /** Null when the form has no slot (or an older server). */
  arrival: RosterArrival | null;
};

export type CheckIn = {
  checkInId: string;
  participantId: string;
  status: CheckInStatus;
  method: CheckInMethod;
  checkedInAt: string;
  checkedInByUserId: string | null;
  checkedInByDisplayName: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelledByDisplayName: string | null;
  cancelReason: string | null;
};

export type CheckInResult = {
  result: "CHECKED_IN" | "ALREADY_CHECKED_IN";
  participant: { participantId: string; name: string; cohort: string | null };
  checkIn: CheckIn;
  /** The published room to tell right away (G5 #460); null before publication or when unassigned. */
  room: DeskRoom | null;
  lodging: Lodging | null;
};

export type CancelResult = {
  result: "CANCELLED" | "ALREADY_CANCELLED";
  checkIn: CheckIn;
};

export const CANCEL_REASON_MAX = 200;
/** Every SCENE check-in QR starts with this (backend/docs/api.md "QR 값"). Others never reach the server. */
export const CHECK_IN_QR_PREFIX = "SCENE-CI1.";
export const ROSTER_QUERY_MAX = 50;
export const ROSTER_PAGE_MAX = 100;

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function getCheckInSummary(eventId: string, signal?: AbortSignal): Promise<CheckInSummary> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/check-ins/summary`, { signal }).then(parseSummary);
}

export function listCheckInRoster(
  eventId: string,
  query: { q?: string; checkedIn?: boolean; arrival?: ArrivalStatus; page: number; size: number },
  signal?: AbortSignal,
): Promise<ItemPage<RosterItem>> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/check-in-roster`, {
    query: {
      q: query.q && query.q.trim().length > 0 ? query.q.trim() : undefined,
      checkedIn: query.checkedIn,
      arrival: query.arrival,
      page: query.page,
      size: query.size,
    },
    signal,
  }).then(parseRoster);
}

/** The whole roster, page by page at the largest size, for the 조별 view (#288). */
export async function listAllCheckInRoster(eventId: string, signal?: AbortSignal): Promise<RosterItem[]> {
  const items: RosterItem[] = [];
  for (let page = 0; ; page += 1) {
    const result = await listCheckInRoster(eventId, { page, size: ROSTER_PAGE_MAX }, signal);
    items.push(...result.items);
    if (page + 1 >= result.page.totalPages) return items;
  }
}

export function checkInManually(
  eventId: string,
  participantId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CheckInResult> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/check-ins`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { mode: "MANUAL", participantId },
    signal,
  }).then(parseCheckInResult);
}

export function isCheckInQr(value: string): boolean {
  return value.startsWith(CHECK_IN_QR_PREFIX) && value.length > CHECK_IN_QR_PREFIX.length;
}

export function checkInByQr(
  eventId: string,
  code: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CheckInResult> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/check-ins`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { mode: "QR", code },
    signal,
  }).then(parseCheckInResult);
}

export function cancelCheckIn(
  eventId: string,
  checkInId: string,
  input: { reason?: string },
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CancelResult> {
  const reason = input.reason?.trim();
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/check-ins/${checkInId}/cancel`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: reason ? { reason } : {},
    signal,
  }).then(parseCancelResult);
}

function unexpected(): never {
  throw new ApiError({ status: 200, code: "UNEXPECTED" });
}

function parseSummary(value: unknown): CheckInSummary {
  if (
    !isRecord(value) ||
    !isLifecycleStatus(value.eventStatus) ||
    !isCount(value.total) ||
    !isCount(value.checkedIn) ||
    !isCount(value.notCheckedIn)
  ) {
    unexpected();
  }
  return {
    eventStatus: value.eventStatus,
    total: value.total,
    checkedIn: value.checkedIn,
    notCheckedIn: value.notCheckedIn,
    arrival: value.arrival === null || value.arrival === undefined ? null : parseSummaryArrival(value.arrival),
  };
}

function parseSummaryArrival(value: unknown): SummaryArrival {
  if (
    !isRecord(value) ||
    typeof value.asOf !== "string" ||
    !isCount(value.overdue) ||
    !isCount(value.coming) ||
    !isCount(value.passed) ||
    !isCount(value.unknown)
  ) {
    unexpected();
  }
  return {
    asOf: value.asOf,
    nextMeal: value.nextMeal === null || value.nextMeal === undefined ? null : parseArrivalSlot(value.nextMeal),
    overdue: value.overdue,
    coming: value.coming,
    passed: value.passed,
    unknown: value.unknown,
  };
}

const ARRIVAL_STATUSES: readonly ArrivalStatus[] = ["ARRIVED", "OVERDUE", "COMING", "PASSED", "UNKNOWN"];

function parseRosterArrival(value: unknown): RosterArrival {
  if (!isRecord(value) || !ARRIVAL_STATUSES.includes(value.status as ArrivalStatus)) unexpected();
  return {
    status: value.status as ArrivalStatus,
    slot: value.slot === null || value.slot === undefined ? null : parseArrivalSlot(value.slot),
  };
}

function parseArrivalSlot(value: unknown): ArrivalSlot {
  if (
    !isRecord(value) ||
    typeof value.slotId !== "string" ||
    !isCount(value.day) ||
    typeof value.dayLabel !== "string" ||
    typeof value.label !== "string"
  ) {
    unexpected();
  }
  return { slotId: value.slotId, day: value.day, dayLabel: value.dayLabel, label: value.label };
}

function parseRoster(value: unknown): ItemPage<RosterItem> {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.page)) unexpected();
  const page = value.page;
  if (!isCount(page.number) || !isCount(page.size) || !isCount(page.totalItems) || !isCount(page.totalPages)) {
    unexpected();
  }
  return {
    items: value.items.map(parseRosterItem),
    page: { number: page.number, size: page.size, totalItems: page.totalItems, totalPages: page.totalPages },
  };
}

function parseRosterItem(value: unknown): RosterItem {
  if (
    !isRecord(value) ||
    typeof value.participantId !== "string" ||
    typeof value.name !== "string" ||
    !isNullableString(value.cohort) ||
    !isNullableString(value.phoneLast4)
  ) {
    unexpected();
  }
  return {
    participantId: value.participantId,
    name: value.name,
    cohort: value.cohort,
    room: parseDeskRoom(value.room),
    lodging: parseLodging(value.lodging),
    phoneLast4: value.phoneLast4,
    checkIn: value.checkIn === null || value.checkIn === undefined ? null : parseRosterCheckIn(value.checkIn),
    arrival: value.arrival === null || value.arrival === undefined ? null : parseRosterArrival(value.arrival),
  };
}

function parseRosterCheckIn(value: unknown): RosterCheckIn {
  if (
    !isRecord(value) ||
    typeof value.checkInId !== "string" ||
    !isStatus(value.status) ||
    !isMethod(value.method) ||
    typeof value.checkedInAt !== "string" ||
    !isNullableString(value.checkedInByDisplayName ?? null)
  ) {
    unexpected();
  }
  return {
    checkInId: value.checkInId,
    status: value.status,
    method: value.method,
    checkedInAt: value.checkedInAt,
    checkedInByDisplayName: (value.checkedInByDisplayName as string | null | undefined) ?? null,
  };
}

function parseCheckIn(value: unknown): CheckIn {
  if (
    !isRecord(value) ||
    typeof value.checkInId !== "string" ||
    typeof value.participantId !== "string" ||
    !isStatus(value.status) ||
    !isMethod(value.method) ||
    typeof value.checkedInAt !== "string"
  ) {
    unexpected();
  }
  return {
    checkInId: value.checkInId,
    participantId: value.participantId,
    status: value.status,
    method: value.method,
    checkedInAt: value.checkedInAt,
    checkedInByUserId: stringOrNull(value.checkedInByUserId),
    checkedInByDisplayName: stringOrNull(value.checkedInByDisplayName),
    cancelledAt: stringOrNull(value.cancelledAt),
    cancelledByUserId: stringOrNull(value.cancelledByUserId),
    cancelledByDisplayName: stringOrNull(value.cancelledByDisplayName),
    cancelReason: stringOrNull(value.cancelReason),
  };
}

function parseCheckInResult(value: unknown): CheckInResult {
  if (
    !isRecord(value) ||
    (value.result !== "CHECKED_IN" && value.result !== "ALREADY_CHECKED_IN") ||
    !isRecord(value.participant) ||
    typeof value.participant.participantId !== "string" ||
    typeof value.participant.name !== "string"
  ) {
    unexpected();
  }
  return {
    result: value.result,
    participant: {
      participantId: value.participant.participantId,
      name: value.participant.name,
      cohort: stringOrNull(value.participant.cohort),
    },
    checkIn: parseCheckIn(value.checkIn),
    room: parseDeskRoom(value.room),
    lodging: parseLodging(value.lodging),
  };
}

function parseCancelResult(value: unknown): CancelResult {
  if (!isRecord(value) || (value.result !== "CANCELLED" && value.result !== "ALREADY_CANCELLED")) unexpected();
  return { result: value.result, checkIn: parseCheckIn(value.checkIn) };
}

function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "ENDED" || value === "ARCHIVED";
}

function isStatus(value: unknown): value is CheckInStatus {
  return value === "CHECKED_IN" || value === "CANCELLED";
}

function isMethod(value: unknown): value is CheckInMethod {
  return value === "QR" || value === "MANUAL";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
