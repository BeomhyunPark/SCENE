import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * Event participant settings (DEC-083 §2, #452): whether ordinary members see their group's roster.
 * Leaders always see it. Never saved and not yet changed reads as on with `version: 0`.
 */
export type ParticipantSettings = {
  groupRosterVisibleToMembers: boolean;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

export function getParticipantSettings(eventId: string, signal?: AbortSignal): Promise<ParticipantSettings> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/participant-settings`, { signal }).then(parse);
}

/** `EVENT_UPDATE`. A different `expectedVersion` is `409 CONCURRENT_MODIFICATION`; nothing is saved. */
export function saveParticipantSettings(
  eventId: string,
  input: { groupRosterVisibleToMembers: boolean; expectedVersion: number },
): Promise<ParticipantSettings> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/participant-settings`, { method: "PUT", body: input }).then(parse);
}

function parse(value: unknown): ParticipantSettings {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Record<string, unknown>).groupRosterVisibleToMembers !== "boolean" ||
    !Number.isInteger((value as Record<string, unknown>).version)
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const record = value as Record<string, unknown>;
  return {
    groupRosterVisibleToMembers: record.groupRosterVisibleToMembers as boolean,
    version: record.version as number,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    updatedByDisplayName: typeof record.updatedByDisplayName === "string" ? record.updatedByDisplayName : null,
  };
}
