import { localUsers } from "./fixtures/seed";
import { requireEventRead } from "./formStore";
import { eventById } from "./operatorStore";
import { permissionsFor } from "./taskStore";

type Stored = { text: string; version: number; updatedAt: string; updatedBy: string };

export type RetrospectiveBody = {
  text: string;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

export type RetrospectiveFailure = { status: number; code: string; errors?: { field: string }[]; version?: number };

const MAX = 10_000;
const stored = new Map<string, Stored>();

export function resetRetrospectiveStore(): void {
  stored.clear();
}

/** Test seam: a retrospective already saved by the seed owner. */
export function saveRetrospectiveText(eventId: string, text: string): void {
  const current = stored.get(eventId);
  stored.set(eventId, {
    text,
    version: (current?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: localUsers[0].userId,
  });
}

/** Same gate and order as RetrospectiveService.read. */
export function readRetrospective(eventId: string, actorId: string): RetrospectiveBody | RetrospectiveFailure {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate;
  return body(eventId);
}

/** Same order as RetrospectiveService.write: 404 → 403 → 400 → 409 state → 409 version. */
export function writeRetrospective(
  eventId: string,
  actorId: string,
  input: unknown,
): RetrospectiveBody | RetrospectiveFailure {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  if (!perms.effective.includes("EVENT_UPDATE")) return { status: 403, code: "FORBIDDEN" };
  const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : null;
  const text = record?.text;
  if (typeof text !== "string" || [...text].length > MAX) return field("text");
  const expected = record?.expectedVersion;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) return field("expectedVersion");
  if (event.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  if (event.lifecycleStatus !== "ENDED") return { status: 409, code: "INVALID_STATE_TRANSITION" };
  const current = stored.get(eventId)?.version ?? 0;
  if (current !== expected) return { status: 409, code: "CONCURRENT_MODIFICATION", version: current };
  stored.set(eventId, { text, version: current + 1, updatedAt: new Date().toISOString(), updatedBy: actorId });
  return body(eventId);
}

function body(eventId: string): RetrospectiveBody {
  const row = stored.get(eventId);
  if (!row) return { text: "", version: 0, updatedAt: null, updatedByDisplayName: null };
  const name = localUsers.find((user) => user.userId === row.updatedBy)?.displayName ?? null;
  return { text: row.text, version: row.version, updatedAt: row.updatedAt, updatedByDisplayName: name };
}

function field(name: string): RetrospectiveFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}
