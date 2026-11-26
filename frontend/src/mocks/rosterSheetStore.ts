import { applyOps, EMPTY_DOC, type RosterSheet, type SheetDoc, type SheetOp } from "../api/rosterSheet";
import { localUsers } from "./fixtures/seed";
import { requireEventRead } from "./formStore";
import { eventById } from "./operatorStore";
import { permissionsFor } from "./taskStore";

type Stored = { doc: SheetDoc; version: number; updatedAt: string; updatedBy: string };
export type RosterSheetFailure = { status: number; code: string; errors?: { field: string }[] };

const stored = new Map<string, Stored>();

export function resetRosterSheetStore(): void {
  stored.clear();
}

/** Same gate as RosterSheetService.read (the applicant table's). */
export function readRosterSheet(eventId: string, actorId: string): RosterSheet | RosterSheetFailure {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate;
  return body(eventId);
}

/** Same order as RosterSheetService.apply: 404 → 403 → 409 archived → 400. */
export function applyRosterSheet(eventId: string, actorId: string, input: unknown): RosterSheet | RosterSheetFailure {
  const gate = requireEventRead(eventId, actorId);
  if (gate && gate.status === 404) return gate;
  const perms = permissionsFor(eventId, actorId, actorId);
  const effective = "effective" in perms ? perms.effective : [];
  if (!effective.includes("PARTICIPANT_WRITE")) return { status: 403, code: "FORBIDDEN" };
  if (eventById(eventId)?.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  const ops = typeof input === "object" && input !== null ? (input as { ops?: unknown }).ops : undefined;
  if (!Array.isArray(ops) || ops.length === 0) return invalid("ops");
  const current = stored.get(eventId);
  let doc: SheetDoc;
  try {
    doc = applyOps(current?.doc ?? EMPTY_DOC, ops as SheetOp[]);
  } catch {
    return invalid("ops");
  }
  stored.set(eventId, { doc, version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: actorId });
  return body(eventId);
}

function body(eventId: string): RosterSheet {
  const current = stored.get(eventId);
  if (!current) return { doc: EMPTY_DOC, version: 0, updatedAt: null, updatedByDisplayName: null };
  const name = localUsers.find((user) => user.userId === current.updatedBy)?.displayName ?? "운영자";
  return { doc: current.doc, version: current.version, updatedAt: current.updatedAt, updatedByDisplayName: name };
}

function invalid(field: string): RosterSheetFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field }] };
}
