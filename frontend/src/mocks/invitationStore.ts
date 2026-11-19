import { localUsers } from "./fixtures/seed";
import { eventById } from "./operatorStore";
import { addOperator, eventRoleOf, operatorsFor } from "./taskStore";

type Status = "PENDING" | "ACCEPTED" | "REVOKED" | "SUPERSEDED";

type Stored = {
  id: string;
  eventId: string;
  email: string;
  role: "MANAGER" | "STAFF";
  status: Status;
  expiresAt: string;
  createdAt: number;
  token: string;
  invitedBy: string;
  acceptedUserId: string | null;
};

export type InvitationFailure = { status: number; code: string; errors?: { field: string }[] };

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LINK_PREFIX = "/operator/invitations#";

let invitations: Stored[] = [];
let sequence = 0;

export function resetInvitationStore(): void {
  invitations = [];
  sequence = 0;
}

/** Owner list: PENDING only, newest first. The token stays off. */
export function pendingInvitations(
  eventId: string,
  actorId: string,
): { id: string; email: string; role: string; status: string; expiresAt: string }[] | InvitationFailure {
  const gate = requireOwner(eventId, actorId);
  if (gate) return gate;
  return invitations
    .filter((row) => row.eventId === eventId && row.status === "PENDING")
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(({ id, email, role, status, expiresAt }) => ({ id, email, role, status, expiresAt }));
}

export function createInvitation(eventId: string, actorId: string, body: unknown): Issued | InvitationFailure {
  const gate = requireOwner(eventId, actorId);
  if (gate) return gate;
  const email = readEmail(body);
  if (!email) return field("email");
  const role = isRecord(body) ? body.role : undefined;
  if (role !== "MANAGER" && role !== "STAFF") return field("role");
  if (eventById(eventId)?.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  return issue(eventId, actorId, email, role);
}

export function resendInvitation(eventId: string, actorId: string, invitationId: string): Issued | InvitationFailure {
  const gate = requireOwner(eventId, actorId);
  if (gate) return gate;
  const row = invitations.find((item) => item.eventId === eventId && item.id === invitationId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (eventById(eventId)?.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  if (row.status !== "PENDING") return field("invitationId");
  return issue(eventId, actorId, row.email, row.role);
}

export function revokeInvitation(
  eventId: string,
  actorId: string,
  invitationId: string,
): { id: string; role: string; status: string; expiresAt: string } | InvitationFailure {
  const gate = requireOwner(eventId, actorId);
  if (gate) return gate;
  const row = invitations.find((item) => item.eventId === eventId && item.id === invitationId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (row.status === "PENDING") row.status = "REVOKED";
  if (row.status !== "REVOKED") return field("invitationId");
  return { id: row.id, role: row.role, status: row.status, expiresAt: row.expiresAt };
}

/** Preview and accept share one judgment, like the server. */
export function judgeInvitation(
  token: unknown,
  actorId: string,
  sessionEmail: string | null,
  accept: boolean,
):
  | {
      eventId: string;
      eventName: string;
      role: string;
      inviterName: string;
      expiresAt: string;
      outcome: string;
      /** Accept only: the caller's role after accepting (#387). */
      operatorRole?: string | null;
    }
  | InvitationFailure {
  const row = typeof token === "string" ? invitations.find((item) => item.token === token) : undefined;
  if (!row) return { status: 404, code: "INVITATION_NOT_FOUND" };
  if (!sessionEmail) return { status: 403, code: "EMAIL_NOT_VERIFIED" };
  if (sessionEmail !== row.email) return { status: 403, code: "INVITATION_EMAIL_MISMATCH" };
  const event = eventById(row.eventId);
  const inviterName = localUsers.find((user) => user.userId === row.invitedBy)?.displayName ?? "";
  const base = { eventId: row.eventId, eventName: event?.name ?? "", role: row.role, inviterName, expiresAt: row.expiresAt };
  if (row.status === "ACCEPTED") {
    if (row.acceptedUserId === actorId) {
      return { ...base, outcome: "ALREADY_ACCEPTED", operatorRole: eventRoleOf(row.eventId, actorId) };
    }
    return { status: 409, code: "INVITATION_ALREADY_ACCEPTED" };
  }
  if (row.status === "REVOKED") return { status: 410, code: "INVITATION_REVOKED" };
  if (row.status === "SUPERSEDED") return { status: 410, code: "INVITATION_SUPERSEDED" };
  if (Date.parse(row.expiresAt) <= Date.now()) return { status: 410, code: "INVITATION_EXPIRED" };
  if (event?.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  if (!accept) return { ...base, outcome: "PENDING" };
  row.status = "ACCEPTED";
  row.acceptedUserId = actorId;
  const user = localUsers.find((item) => item.userId === actorId);
  // An operator who is already on the event keeps their role, like the server (#387).
  addOperator(row.eventId, actorId, user?.displayName ?? "", row.role);
  return { ...base, outcome: "ACCEPTED", operatorRole: eventRoleOf(row.eventId, actorId) };
}

type Issued = { id: string; role: string; status: string; expiresAt: string; link: string };

function issue(eventId: string, actorId: string, email: string, role: "MANAGER" | "STAFF"): Issued {
  for (const row of invitations) {
    if (row.eventId === eventId && row.email === email && row.status === "PENDING") row.status = "SUPERSEDED";
  }
  const row: Stored = {
    id: crypto.randomUUID(),
    eventId,
    email,
    role,
    status: "PENDING",
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    createdAt: (sequence += 1),
    token: randomToken(),
    invitedBy: actorId,
    acceptedUserId: null,
  };
  invitations.push(row);
  return { id: row.id, role, status: row.status, expiresAt: row.expiresAt, link: LINK_PREFIX + row.token };
}

function requireOwner(eventId: string, actorId: string): InvitationFailure | null {
  const rows = operatorsFor(eventId, actorId);
  if (!Array.isArray(rows)) return { status: rows.status, code: rows.code };
  return eventRoleOf(eventId, actorId) === "OWNER" ? null : { status: 403, code: "FORBIDDEN" };
}

function readEmail(body: unknown): string | null {
  if (!isRecord(body) || typeof body.email !== "string") return null;
  const email = body.email.trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1 || email.length > 320 || /\s/.test(email)) {
    return null;
  }
  return email;
}

function field(name: string): InvitationFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
