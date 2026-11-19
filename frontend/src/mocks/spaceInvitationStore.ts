import { localUsers } from "./fixtures/seed";
import { addMembership, membersOf, spacesFor } from "./operatorStore";

type Status = "PENDING" | "ACCEPTED" | "REVOKED" | "SUPERSEDED";
type InviteRole = "MEMBER" | "ADMIN";

type Stored = {
  id: string;
  spaceId: string;
  email: string;
  role: InviteRole;
  status: Status;
  expiresAt: string;
  createdAt: number;
  token: string;
  invitedBy: string;
  acceptedUserId: string | null;
};

export type SpaceInvitationFailure = { status: number; code: string; errors?: { field: string }[] };

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LINK_PREFIX = "/operator/invitations#";
const TOKEN_PREFIX = "s.";
const ROLE_ORDER: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

/** The verified email from each member's last Google login. Local staff has none, so it has no email key. */
function seedEmails(): Map<string, string> {
  return new Map([
    [localUsers[0].userId, "owner@example.com"],
    [localUsers[1].userId, "manager@example.com"],
  ]);
}

let invitations: Stored[] = [];
let emails = seedEmails();
let sequence = 0;

export function resetSpaceInvitationStore(): void {
  invitations = [];
  emails = seedEmails();
  sequence = 0;
}

/** Test helper: put a pending invitation straight into the store and return its token. */
export function seedSpaceInvitation(spaceId: string, email: string, invitedBy: string = localUsers[0].userId): string {
  return issue(spaceId, invitedBy, email, "MEMBER").link.slice(LINK_PREFIX.length);
}

/** Active members, OWNER·ADMIN·MEMBER then name. Email only for OWNER·ADMIN viewers. */
export function spaceMembers(
  spaceId: string,
  actorId: string,
): { userId: string; displayName: string; role: string; email?: string }[] | SpaceInvitationFailure {
  const role = roleOf(spaceId, actorId);
  if (!role) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const seesEmails = role === "OWNER" || role === "ADMIN";
  return membersOf(spaceId)
    .map((membership) => {
      const displayName = localUsers.find((user) => user.userId === membership.userId)?.displayName ?? "";
      const item: { userId: string; displayName: string; role: string; email?: string } = {
        userId: membership.userId,
        displayName,
        role: membership.role,
      };
      const email = emails.get(membership.userId);
      if (seesEmails && email) item.email = email;
      return item;
    })
    .sort(
      (left, right) =>
        (ROLE_ORDER[left.role] ?? 9) - (ROLE_ORDER[right.role] ?? 9) ||
        (left.displayName < right.displayName ? -1 : left.displayName > right.displayName ? 1 : 0) ||
        left.userId.localeCompare(right.userId),
    );
}

export function pendingSpaceInvitations(
  spaceId: string,
  actorId: string,
): { id: string; email: string; role: string; status: string; expiresAt: string }[] | SpaceInvitationFailure {
  const gate = requireInviter(spaceId, actorId);
  if (gate) return gate;
  return invitations
    .filter((row) => row.spaceId === spaceId && row.status === "PENDING")
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(({ id, email, role, status, expiresAt }) => ({ id, email, role, status, expiresAt }));
}

export function createSpaceInvitation(spaceId: string, actorId: string, body: unknown): Issued | SpaceInvitationFailure {
  const gate = requireInviter(spaceId, actorId);
  if (gate) return gate;
  const email = readEmail(body);
  if (!email) return field("email");
  const raw = isRecord(body) ? body.role : undefined;
  const role = raw === undefined || raw === null ? "MEMBER" : raw;
  if (role !== "MEMBER" && role !== "ADMIN") return field("role");
  if (role === "ADMIN" && roleOf(spaceId, actorId) !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  return issue(spaceId, actorId, email, role);
}

export function resendSpaceInvitation(
  spaceId: string,
  actorId: string,
  invitationId: string,
): Issued | SpaceInvitationFailure {
  const gate = requireInviter(spaceId, actorId);
  if (gate) return gate;
  const row = invitations.find((item) => item.spaceId === spaceId && item.id === invitationId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (row.role === "ADMIN" && roleOf(spaceId, actorId) !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  if (row.status !== "PENDING") return field("invitationId");
  return issue(spaceId, actorId, row.email, row.role);
}

export function revokeSpaceInvitation(
  spaceId: string,
  actorId: string,
  invitationId: string,
): { id: string; role: string; status: string; expiresAt: string } | SpaceInvitationFailure {
  const gate = requireInviter(spaceId, actorId);
  if (gate) return gate;
  const row = invitations.find((item) => item.spaceId === spaceId && item.id === invitationId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (row.role === "ADMIN" && roleOf(spaceId, actorId) !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  if (row.status === "PENDING") row.status = "REVOKED";
  if (row.status !== "REVOKED") return field("invitationId");
  return { id: row.id, role: row.role, status: row.status, expiresAt: row.expiresAt };
}

type Judgment = {
  spaceId: string;
  spaceName: string;
  role: string;
  inviterName: string;
  expiresAt: string;
  outcome: string;
};

/** Preview and accept share one judgment and order, like SpaceInvitationService. */
export function judgeSpaceInvitation(
  token: unknown,
  actorId: string,
  sessionEmail: string | null,
  accept: boolean,
): Judgment | SpaceInvitationFailure {
  const row =
    typeof token === "string" && token.startsWith(TOKEN_PREFIX)
      ? invitations.find((item) => item.token === token)
      : undefined;
  if (!row) return { status: 404, code: "INVITATION_NOT_FOUND" };
  if (!sessionEmail) return { status: 403, code: "EMAIL_NOT_VERIFIED" };
  if (sessionEmail !== row.email) return { status: 403, code: "INVITATION_EMAIL_MISMATCH" };
  const spaceName = membersOf(row.spaceId)[0]?.name ?? "";
  const inviterName = localUsers.find((user) => user.userId === row.invitedBy)?.displayName ?? "";
  const base = { spaceId: row.spaceId, spaceName, role: row.role, inviterName, expiresAt: row.expiresAt };
  if (row.status === "ACCEPTED") {
    if (row.acceptedUserId === actorId) return { ...base, outcome: "ALREADY_ACCEPTED" };
    return { status: 409, code: "INVITATION_ALREADY_ACCEPTED" };
  }
  if (row.status === "REVOKED") return { status: 410, code: "INVITATION_REVOKED" };
  if (row.status === "SUPERSEDED") return { status: 410, code: "INVITATION_SUPERSEDED" };
  if (Date.parse(row.expiresAt) <= Date.now()) return { status: 410, code: "INVITATION_EXPIRED" };
  const member = roleOf(row.spaceId, actorId) != null;
  if (!accept) return { ...base, outcome: member ? "ALREADY_MEMBER" : "PENDING" };
  row.status = "ACCEPTED";
  row.acceptedUserId = actorId;
  if (member) return { ...base, outcome: "ALREADY_MEMBER" };
  addMembership(row.spaceId, actorId, row.role);
  emails.set(actorId, sessionEmail);
  return { ...base, outcome: "ACCEPTED" };
}

type Issued = { id: string; role: string; status: string; expiresAt: string; link: string };

function issue(spaceId: string, actorId: string, email: string, role: InviteRole): Issued {
  for (const row of invitations) {
    if (row.spaceId === spaceId && row.email === email && row.status === "PENDING") row.status = "SUPERSEDED";
  }
  const row: Stored = {
    id: crypto.randomUUID(),
    spaceId,
    email,
    role,
    status: "PENDING",
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    createdAt: (sequence += 1),
    token: TOKEN_PREFIX + randomToken(),
    invitedBy: actorId,
    acceptedUserId: null,
  };
  invitations.push(row);
  return { id: row.id, role, status: row.status, expiresAt: row.expiresAt, link: LINK_PREFIX + row.token };
}

function roleOf(spaceId: string, userId: string): string | null {
  return spacesFor(userId).find((space) => space.spaceId === spaceId)?.role ?? null;
}

function requireInviter(spaceId: string, actorId: string): SpaceInvitationFailure | null {
  const role = roleOf(spaceId, actorId);
  if (!role) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  return role === "OWNER" || role === "ADMIN" ? null : { status: 403, code: "FORBIDDEN" };
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

function field(name: string): SpaceInvitationFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
