import { apiRequest } from "./client";

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
