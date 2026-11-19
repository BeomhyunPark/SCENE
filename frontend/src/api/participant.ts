import { apiRequest } from "./client";
import { ApiError } from "./errors";

/** `pinChangeRequired`: signed in with an operator's temporary number; a new one must be set first. */
export type ParticipantMe = {
  participantId: string;
  eventId: string;
  spaceId: string;
  name: string;
  pinChangeRequired: boolean;
};

export type ParticipantSignIn = { name: string; phone: string; pin: string };

/** DEC-078 §3. Any wrong part is `PARTICIPANT_LOGIN_FAILED`; five in a row lock the phone. */
export function signInParticipant(eventId: string, input: ParticipantSignIn): Promise<void> {
  return apiRequest(`/api/v1/public/events/${eventId}/participant-sessions`, {
    method: "POST",
    body: { name: input.name, phone: input.phone, pin: input.pin },
  });
}

export function getParticipantMe(signal?: AbortSignal): Promise<ParticipantMe> {
  return apiRequest<unknown>("/api/v1/participant/me", { signal }).then(parseMe);
}

/** `PUT /participant/pin`. A temporary-number session leaves `currentPin` out. */
export function changeParticipantPin(input: { currentPin?: string; newPin: string }): Promise<void> {
  const body: { currentPin?: string; newPin: string } = { newPin: input.newPin };
  if (input.currentPin !== undefined) body.currentPin = input.currentPin;
  return apiRequest("/api/v1/participant/pin", { method: "PUT", body });
}

export function logoutParticipant(): Promise<void> {
  return apiRequest("/api/v1/participant/auth/logout", { method: "POST" });
}

/** Operator reset (DEC-078 §2). The temporary number is in this response only. */
export function resetParticipantPin(eventId: string, participantId: string): Promise<string> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/participants/${participantId}/pin-reset`, {
    method: "POST",
    body: {},
  }).then((value) => {
    if (!isRecord(value) || typeof value.temporaryPin !== "string") {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    return value.temporaryPin;
  });
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
    pinChangeRequired: value.pinChangeRequired === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
