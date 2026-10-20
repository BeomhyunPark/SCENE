import { apiRequest } from "./client";
import { ApiError } from "./errors";

export type ParticipantMe = {
  participantId: string;
  eventId: string;
  spaceId: string;
  name: string;
};

export function openParticipantSession(eventId: string, accessKey: string): Promise<void> {
  return apiRequest(`/api/v1/public/events/${eventId}/participant-sessions`, {
    method: "POST",
    body: { accessKey },
  });
}

export function getParticipantMe(signal?: AbortSignal): Promise<ParticipantMe> {
  return apiRequest<unknown>("/api/v1/participant/me", { signal }).then(parseMe);
}

export function logoutParticipant(): Promise<void> {
  return apiRequest("/api/v1/participant/auth/logout", { method: "POST" });
}

function parseMe(value: unknown): ParticipantMe {
  if (
    !isRecord(value) ||
    typeof value.participantId !== "string" ||
    typeof value.eventId !== "string" ||
    typeof value.spaceId !== "string" ||
    typeof value.name !== "string"
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return {
    participantId: value.participantId,
    eventId: value.eventId,
    spaceId: value.spaceId,
    name: value.name,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
