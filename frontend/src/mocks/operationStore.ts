import { localUsers } from "./fixtures/seed";
import { eventById } from "./operatorStore";
import { submittedApplication } from "./participantStore";
import { permissionsFor } from "./taskStore";

/**
 * Operation memo per application (#335, DEC-075), shaped like ApplicationOperationService. The
 * original answers in participantStore never change.
 */
type Stored = { memo: string; version: number; updatedAt: string; updatedBy: string };

export type OperationBody = {
  memo: string;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

export type OperationFailure = {
  status: number;
  code: string;
  errors?: { field: string }[];
  version?: number;
  applicationStatus?: string;
};

const MAX = 2_000;
const stored = new Map<string, Stored>();

export function resetOperationStore(): void {
  stored.clear();
}

/** Test and mock-click seam: a memo already saved by `userId` (default the seed owner). */
export function seedOperationMemo(applicationId: string, memo: string, userId: string = localUsers[0].userId): void {
  const current = stored.get(applicationId);
  stored.set(applicationId, { memo, version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: userId });
}

export function operationOf(applicationId: string): OperationBody {
  const row = stored.get(applicationId);
  if (!row) return { memo: "", version: 0, updatedAt: null, updatedByDisplayName: null };
  const name = localUsers.find((user) => user.userId === row.updatedBy)?.displayName ?? null;
  return { memo: row.memo, version: row.version, updatedAt: row.updatedAt, updatedByDisplayName: name };
}

/** Same order as the server: 404 → 403 → 400 → 409 state → 409 version. */
export function writeOperation(
  eventId: string,
  applicationId: string,
  actorId: string,
  input: unknown,
): OperationBody | OperationFailure {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const application = submittedApplication(eventId, applicationId);
  if (!application) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const perms = permissionsFor(eventId, actorId, actorId);
  if ("status" in perms) return perms;
  if (!perms.effective.includes("PARTICIPANT_WRITE")) return { status: 403, code: "FORBIDDEN" };
  const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : null;
  const memo = record?.memo;
  if (typeof memo !== "string" || [...memo].length > MAX) return field("memo");
  const expected = record?.expectedVersion;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) return field("expectedVersion");
  if (event.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  if (application.status !== "SUBMITTED") {
    return { status: 409, code: "INVALID_STATE_TRANSITION", applicationStatus: application.status };
  }
  const current = stored.get(applicationId)?.version ?? 0;
  if (current !== expected) return { status: 409, code: "CONCURRENT_MODIFICATION", version: current };
  stored.set(applicationId, { memo, version: current + 1, updatedAt: new Date().toISOString(), updatedBy: actorId });
  return operationOf(applicationId);
}

function field(name: string): OperationFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}
