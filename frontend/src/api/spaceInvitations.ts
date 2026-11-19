import { apiRequest } from "./client";
import { ApiError } from "./errors";
import {
  isRecord,
  parseIssued,
  parsePendingPage,
  type IssuedInvitation,
  type PendingInvitation,
} from "./invitations";
import type { ItemPage } from "./types";

/**
 * Space (organization) invitations and members (DEC-076, #361). Space invitation tokens start
 * with "s." and use the space-invitations preview and accept paths. Event tokens do not.
 */
export const SPACE_TOKEN_PREFIX = "s.";

export function isSpaceInvitationToken(token: string): boolean {
  return token.startsWith(SPACE_TOKEN_PREFIX);
}

export type SpaceInvitationPreview = {
  spaceName: string;
  role: string;
  inviterName: string;
  expiresAt: string;
  outcome: string;
};

export type SpaceInvitationAcceptance = {
  outcome: string;
  spaceId: string;
};

export type SpaceMember = {
  userId: string;
  displayName: string;
  role: string;
  /** Only when the viewer is an active OWNER or ADMIN, and only for members with a Google login. */
  email?: string;
};

export function previewSpaceInvitation(token: string, signal?: AbortSignal): Promise<SpaceInvitationPreview> {
  return apiRequest("/api/v1/operator/space-invitations/preview", {
    method: "POST",
    body: { token },
    signal,
  });
}

export function acceptSpaceInvitation(token: string, signal?: AbortSignal): Promise<SpaceInvitationAcceptance> {
  return apiRequest("/api/v1/operator/space-invitations/accept", {
    method: "POST",
    body: { token },
    signal,
  });
}

export function listSpaceInvitations(spaceId: string, signal?: AbortSignal): Promise<ItemPage<PendingInvitation>> {
  return apiRequest<unknown>(`/api/v1/operator/spaces/${spaceId}/invitations`, {
    query: { page: 0, size: 100 },
    signal,
  }).then(parsePendingPage);
}

/** The January screen has no role picker, so the role is left out and the server uses MEMBER. */
export function createSpaceInvitation(spaceId: string, input: { email: string }): Promise<IssuedInvitation> {
  return apiRequest<unknown>(`/api/v1/operator/spaces/${spaceId}/invitations`, {
    method: "POST",
    body: { email: input.email },
  }).then(parseIssued);
}

export function resendSpaceInvitation(spaceId: string, invitationId: string): Promise<IssuedInvitation> {
  return apiRequest<unknown>(`/api/v1/operator/spaces/${spaceId}/invitations/${invitationId}/resend`, {
    method: "POST",
  }).then(parseIssued);
}

export function revokeSpaceInvitation(spaceId: string, invitationId: string): Promise<void> {
  return apiRequest<unknown>(`/api/v1/operator/spaces/${spaceId}/invitations/${invitationId}`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function listSpaceMembers(spaceId: string, signal?: AbortSignal): Promise<ItemPage<SpaceMember>> {
  return apiRequest<unknown>(`/api/v1/operator/spaces/${spaceId}/members`, {
    query: { page: 0, size: 100 },
    signal,
  }).then(parseMemberPage);
}

function parseMemberPage(value: unknown): ItemPage<SpaceMember> {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.page)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const items: SpaceMember[] = [];
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.userId !== "string" ||
      typeof item.displayName !== "string" ||
      typeof item.role !== "string" ||
      (item.email !== undefined && item.email !== null && typeof item.email !== "string")
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    const member: SpaceMember = { userId: item.userId, displayName: item.displayName, role: item.role };
    if (typeof item.email === "string" && item.email.length > 0) member.email = item.email;
    items.push(member);
  }
  const page = value.page;
  if (
    typeof page.number !== "number" ||
    typeof page.size !== "number" ||
    typeof page.totalItems !== "number" ||
    typeof page.totalPages !== "number"
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return {
    items,
    page: { number: page.number, size: page.size, totalItems: page.totalItems, totalPages: page.totalPages },
  };
}
