import { localEvent, localUsers } from "./fixtures/seed";
import { requireEventRead } from "./formStore";
import { eventById } from "./operatorStore";
import { checkInCandidates } from "./participantStore";
import { permissionsFor } from "./taskStore";

/**
 * Shaped like CheckInController (#282). Write order follows backend/docs/api.md "체크인":
 * 404·403 NOT_A_MEMBER → 403 FORBIDDEN → 400 Idempotency-Key·body → 409 event state → 404 target
 * → same key → 409 eligibility → 200.
 *
 * QR values keep the server's shape (`SCENE-CI1.` + base64url(participant id 16 bytes ‖ 16-byte tag)) and
 * its order (prefix → base64url → 32 bytes → participant of the event → tag), but the tag is a plain
 * hash of the event and participant, not an HMAC. Mock codes come from `checkInCodeFor`.
 */
type Participant = {
  participantId: string;
  name: string;
  cohort: string | null;
  phoneLast4: string;
  submitted: boolean;
};

type Row = {
  checkInId: string;
  participantId: string;
  status: "CHECKED_IN" | "CANCELLED";
  method: "QR" | "MANUAL";
  checkedInAt: string;
  checkedInBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
};

type Log = { key: string; checkInId: string; participantId: string; action: "CHECKED_IN" | "CANCELLED" };

export type CheckInFailure = {
  status: number;
  code: string;
  errors?: { field: string }[];
  eventStatus?: string;
  reason?: string;
};

const MAX_KEY = 100;
const MAX_REASON = 200;
const MAX_Q = 50;
const QR_PREFIX = "SCENE-CI1.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let participants = new Map<string, Participant[]>();
let rows = new Map<string, Row[]>();
let logs = new Map<string, Log[]>();

export function resetCheckInStore(): void {
  participants = new Map([[localEvent.eventId, seedParticipants()]]);
  rows = new Map();
  logs = new Map();
}
resetCheckInStore();

/** Test seam: an earlier check-in by the seed STAFF. */
export function seedCheckIn(eventId: string, participantId: string, at = "2027-01-15T01:42:00Z"): string {
  const row = newRow(participantId, "QR", localUsers[2].userId, at);
  rowsOf(eventId).push(row);
  return row.checkInId;
}

/** Test seam: the check-in_logs rows the mock wrote, to count how many times a resend was recorded (#287). */
export function checkInLogsOf(eventId: string): readonly { participantId: string; action: "CHECKED_IN" | "CANCELLED" }[] {
  return logsOf(eventId).map(({ participantId, action }) => ({ participantId, action }));
}

/** Test seam: a participant whose application was withdrawn after the roster was loaded. */
export function withdrawParticipant(eventId: string, participantId: string): void {
  const found = participantsOf(eventId).find((item) => item.participantId === participantId);
  if (found) found.submitted = false;
}

/** The mock's QR value for a participant, shaped like the server's (#286). */
export function checkInCodeFor(eventId: string, participantId: string): string {
  const id = uuidBytes(participantId);
  const bytes = new Uint8Array(32);
  bytes.set(id, 0);
  bytes.set(mockTag(eventId, participantId), 16);
  return QR_PREFIX + base64url(bytes);
}

export function seededParticipants(): readonly { participantId: string; name: string }[] {
  return seedParticipants();
}

export function readSummary(eventId: string, actorId: string) {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate;
  const event = eventById(eventId)!;
  const eligible = participantsOf(eventId).filter((item) => item.submitted);
  const checkedIn = eligible.filter((item) => currentRow(eventId, item.participantId)?.status === "CHECKED_IN").length;
  return { eventStatus: event.lifecycleStatus, total: eligible.length, checkedIn, notCheckedIn: eligible.length - checkedIn };
}

export function readRoster(eventId: string, actorId: string, url: URL) {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate;
  const canWrite = hasCheckInWrite(eventId, actorId);
  const rawQ = url.searchParams.get("q");
  let q: string | null = null;
  if (rawQ !== null) {
    q = rawQ.trim();
    if (q.length === 0 || [...q].length > MAX_Q) return field("q");
  }
  const rawChecked = url.searchParams.get("checkedIn");
  if (rawChecked !== null && rawChecked !== "true" && rawChecked !== "false") return field("checkedIn");
  const page = Number(url.searchParams.get("page") ?? "0");
  const size = Number(url.searchParams.get("size") ?? "50");
  if (!Number.isInteger(page) || page < 0) return field("page");
  if (!Number.isInteger(size) || size < 1) return field("size");
  if (size > 100) return { status: 400, code: "PAGE_SIZE_EXCEEDED" };

  const needle = q?.toLowerCase() ?? null;
  const byDigits = q !== null && /^\d{4}$/.test(q) && canWrite;
  const matches = participantsOf(eventId)
    .filter((item) => item.submitted)
    .filter((item) => {
      if (needle === null) return true;
      if (item.name.toLowerCase().includes(needle)) return true;
      return byDigits && item.phoneLast4 === q;
    })
    .filter((item) => {
      if (rawChecked === null) return true;
      const checked = currentRow(eventId, item.participantId)?.status === "CHECKED_IN";
      return rawChecked === "true" ? checked : !checked;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.participantId.localeCompare(b.participantId));
  const items = matches.slice(page * size, page * size + size).map((item) => {
    const row = currentRow(eventId, item.participantId);
    return {
      participantId: item.participantId,
      name: item.name,
      cohort: item.cohort,
      phoneLast4: canWrite ? item.phoneLast4 : null,
      checkIn: row
        ? {
            checkInId: row.checkInId,
            status: row.status,
            method: row.method,
            checkedInAt: row.checkedInAt,
            checkedInByDisplayName: displayName(row.checkedInBy),
          }
        : null,
    };
  });
  return {
    items,
    page: { number: page, size, totalItems: matches.length, totalPages: Math.ceil(matches.length / size) },
  };
}

export function checkIn(eventId: string, actorId: string, key: string | null, body: unknown) {
  const gate = writeGate(eventId, actorId, key);
  if (gate) return gate;
  const record = isRecord(body) ? body : null;
  const mode = record?.mode;
  if (mode !== "MANUAL" && mode !== "QR") return field("mode");
  if (mode === "QR" && (typeof record?.code !== "string" || record.code.length === 0)) return field("code");
  if (mode === "MANUAL" && (typeof record?.participantId !== "string" || !UUID.test(record.participantId))) {
    return field("participantId");
  }
  const state = stateGate(eventId);
  if (state) return state;
  let participantId: string;
  if (mode === "QR") {
    const decoded = participantFromCode(eventId, record!.code as string);
    if (!decoded) return { status: 404, code: "RESOURCE_NOT_FOUND" };
    participantId = decoded;
  } else {
    participantId = record!.participantId as string;
  }
  const target = participantsOf(eventId).find((item) => item.participantId === participantId);
  if (!target) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const replay = sameKey(eventId, key!, participantId, "CHECKED_IN");
  if (replay) return replay === "conflict" ? { status: 409, code: "CONFLICT" } : checkInBody("CHECKED_IN", eventId, target);
  if (!target.submitted) return { status: 409, code: "INVALID_STATE_TRANSITION", reason: "APPLICATION_NOT_SUBMITTED" };
  const existing = currentRow(eventId, participantId);
  if (existing?.status === "CHECKED_IN") return checkInBody("ALREADY_CHECKED_IN", eventId, target);
  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, {
      status: "CHECKED_IN",
      method: mode,
      checkedInAt: now,
      checkedInBy: actorId,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
    });
  } else {
    rowsOf(eventId).push(newRow(participantId, mode, actorId, now));
  }
  const row = currentRow(eventId, participantId)!;
  logsOf(eventId).push({ key: key!, checkInId: row.checkInId, participantId, action: "CHECKED_IN" });
  return checkInBody("CHECKED_IN", eventId, target);
}

export function cancel(eventId: string, checkInId: string, actorId: string, key: string | null, body: unknown) {
  const gate = writeGate(eventId, actorId, key);
  if (gate) return gate;
  const record = isRecord(body) ? body : {};
  let reason: string | null = null;
  if (record.reason !== undefined && record.reason !== null) {
    if (typeof record.reason !== "string") return field("reason");
    const trimmed = record.reason.trim();
    if ([...trimmed].length > MAX_REASON) return field("reason");
    reason = trimmed.length > 0 ? trimmed : null;
  }
  const state = stateGate(eventId);
  if (state) return state;
  const row = rowsOf(eventId).find((item) => item.checkInId === checkInId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const replay = sameKey(eventId, key!, row.participantId, "CANCELLED");
  if (replay) return replay === "conflict" ? { status: 409, code: "CONFLICT" } : { result: "CANCELLED", checkIn: full(row) };
  if (row.status === "CANCELLED") return { result: "ALREADY_CANCELLED", checkIn: full(row) };
  Object.assign(row, { status: "CANCELLED", cancelledAt: new Date().toISOString(), cancelledBy: actorId, cancelReason: reason });
  logsOf(eventId).push({ key: key!, checkInId: row.checkInId, participantId: row.participantId, action: "CANCELLED" });
  return { result: "CANCELLED", checkIn: full(row) };
}

function writeGate(eventId: string, actorId: string, key: string | null): CheckInFailure | null {
  if (!eventById(eventId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  if (!perms.effective.includes("CHECKIN_WRITE")) return { status: 403, code: "FORBIDDEN" };
  if (key === null || key.length < 1 || key.length > MAX_KEY) return field("Idempotency-Key");
  return null;
}

function stateGate(eventId: string): CheckInFailure | null {
  const status = eventById(eventId)!.lifecycleStatus;
  if (status === "DRAFT") return { status: 409, code: "INVALID_STATE_TRANSITION", eventStatus: status };
  if (status === "ENDED") return { status: 409, code: "EVENT_ENDED" };
  if (status === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  return null;
}

function sameKey(eventId: string, key: string, participantId: string, action: Log["action"]): "conflict" | "replay" | null {
  const log = logsOf(eventId).find((item) => item.key === key);
  if (!log) return null;
  return log.participantId === participantId && log.action === action ? "replay" : "conflict";
}

function hasCheckInWrite(eventId: string, actorId: string): boolean {
  const perms = permissionsFor(eventId, actorId, actorId);
  return !("status" in perms) && perms.effective.includes("CHECKIN_WRITE");
}

function checkInBody(result: "CHECKED_IN" | "ALREADY_CHECKED_IN", eventId: string, target: Participant) {
  return {
    result,
    participant: { participantId: target.participantId, name: target.name, cohort: target.cohort },
    checkIn: full(currentRow(eventId, target.participantId)!),
  };
}

function full(row: Row) {
  return {
    checkInId: row.checkInId,
    participantId: row.participantId,
    status: row.status,
    method: row.method,
    checkedInAt: row.checkedInAt,
    checkedInByUserId: row.checkedInBy,
    checkedInByDisplayName: displayName(row.checkedInBy),
    cancelledAt: row.cancelledAt,
    cancelledByUserId: row.cancelledBy,
    cancelledByDisplayName: displayName(row.cancelledBy),
    cancelReason: row.cancelReason,
  };
}

function newRow(participantId: string, method: Row["method"], actorId: string, at: string): Row {
  return {
    checkInId: crypto.randomUUID(),
    participantId,
    status: "CHECKED_IN",
    method,
    checkedInAt: at,
    checkedInBy: actorId,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
  };
}

function participantsOf(eventId: string): Participant[] {
  const seeded = participants.get(eventId) ?? [];
  const applied = checkInCandidates(eventId)
    .filter((item) => !seeded.some((row) => row.participantId === item.participantId))
    .map((item) => ({ ...item, submitted: true }));
  return [...seeded, ...applied];
}

function rowsOf(eventId: string): Row[] {
  let list = rows.get(eventId);
  if (!list) rows.set(eventId, (list = []));
  return list;
}

function logsOf(eventId: string): Log[] {
  let list = logs.get(eventId);
  if (!list) logs.set(eventId, (list = []));
  return list;
}

/** Arrival time of a participant for the 참가 현황 table (#308), or null when not checked in. */
export function checkedInAtOf(eventId: string, participantId: string): string | null {
  const row = currentRow(eventId, participantId);
  return row?.status === "CHECKED_IN" ? row.checkedInAt : null;
}

function currentRow(eventId: string, participantId: string): Row | undefined {
  return rowsOf(eventId).find((row) => row.participantId === participantId);
}

function displayName(userId: string | null): string | null {
  if (!userId) return null;
  return localUsers.find((user) => user.userId === userId)?.displayName ?? null;
}

function field(name: string): CheckInFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function seedParticipants(): Participant[] {
  const rows: [string, string | null, string][] = [
    ["김하늘", "94", "1234"],
    ["김하람", "95", "5678"],
    ["박서준", "96", "2468"],
    ["이수아", "94", "1357"],
    ["이수아", "97", "8642"],
    ["정민호", null, "9090"],
    ["최예린", "98", "1234"],
    ["한지우", "95", "3141"],
  ];
  return rows.map(([name, cohort, phoneLast4], index) => ({
    // Same ids as the 조 편성 seed (groupStore), so the 조별 view joins them (#288).
    participantId: `00000000-0000-4000-8000-0000000004${String(index).padStart(2, "0")}`,
    name,
    cohort,
    phoneLast4,
    submitted: true,
  }));
}

function participantFromCode(eventId: string, code: string): string | null {
  if (!code.startsWith(QR_PREFIX)) return null;
  const bytes = fromBase64url(code.slice(QR_PREFIX.length));
  if (!bytes || bytes.length !== 32) return null;
  const participantId = uuidString(bytes.slice(0, 16));
  if (!participantsOf(eventId).some((item) => item.participantId === participantId)) return null;
  const expected = mockTag(eventId, participantId);
  return expected.every((byte, index) => byte === bytes[16 + index]) ? participantId : null;
}

/** FNV-1a over the server's signing input, stretched to 16 bytes. Not a signature; mock only. */
function mockTag(eventId: string, participantId: string): Uint8Array {
  const input = new TextEncoder().encode(`checkin|1|${eventId}|${participantId}|0`);
  const out = new Uint8Array(16);
  for (let block = 0; block < 4; block += 1) {
    let hash = 0x811c9dc5 ^ block;
    for (const byte of input) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    out.set([hash >>> 24, (hash >>> 16) & 0xff, (hash >>> 8) & 0xff, hash & 0xff], block * 4);
  }
  return out;
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  return Uint8Array.from({ length: 16 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function uuidString(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
