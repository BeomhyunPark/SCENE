import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { ItemPage } from "./types";

export type InvitationPreview = {
  eventName: string;
  role: string;
  inviterName: string;
  expiresAt: string;
  outcome: string;
};

export type InvitationAcceptance = {
  outcome: string;
};

export function previewInvitation(token: string, signal?: AbortSignal): Promise<InvitationPreview> {
  return apiRequest("/api/v1/operator/invitations/preview", {
    method: "POST",
    body: { token },
    signal,
  });
}

export function acceptInvitation(token: string, signal?: AbortSignal): Promise<InvitationAcceptance> {
  return apiRequest("/api/v1/operator/invitations/accept", {
    method: "POST",
    body: { token },
    signal,
  });
}

export type InvitationRole = "MANAGER" | "STAFF";

/** One pending invitation on the owner's list. No token, hash, or link. */
export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
};

/** Create and resend body. `link` is shown once and is not stored in the browser. */
export type IssuedInvitation = {
  id: string;
  role: string;
  status: string;
  expiresAt: string;
  link: string;
};

const LINK_PREFIX = "/operator/invitations#";

export function listInvitations(eventId: string, signal?: AbortSignal): Promise<ItemPage<PendingInvitation>> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/invitations`, {
    query: { page: 0, size: 100 },
    signal,
  }).then(parsePendingPage);
}

export function createInvitation(eventId: string, input: { email: string; role: InvitationRole }): Promise<IssuedInvitation> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/invitations`, {
    method: "POST",
    body: input,
  }).then(parseIssued);
}

export function resendInvitation(eventId: string, invitationId: string): Promise<IssuedInvitation> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/invitations/${invitationId}/resend`, {
    method: "POST",
  }).then(parseIssued);
}

export function revokeInvitation(eventId: string, invitationId: string): Promise<void> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/invitations/${invitationId}`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function parseIssued(value: unknown): IssuedInvitation {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.role !== "string" ||
    typeof value.status !== "string" ||
    typeof value.expiresAt !== "string" ||
    typeof value.link !== "string" ||
    !value.link.startsWith(LINK_PREFIX) ||
    value.link.length === LINK_PREFIX.length ||
    value.link.includes("?")
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return { id: value.id, role: value.role, status: value.status, expiresAt: value.expiresAt, link: value.link };
}

export function parsePendingPage(value: unknown): ItemPage<PendingInvitation> {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.page)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const items: PendingInvitation[] = [];
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.email !== "string" ||
      typeof item.role !== "string" ||
      typeof item.status !== "string" ||
      typeof item.expiresAt !== "string"
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    items.push({ id: item.id, email: item.email, role: item.role, status: item.status, expiresAt: item.expiresAt });
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
