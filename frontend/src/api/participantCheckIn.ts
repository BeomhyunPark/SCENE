import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * The participant's own arrival QR (#283, DEC-071). `code` is set only while `status` is AVAILABLE.
 * A 404 RESOURCE_NOT_FOUND means the server has no QR secret, so there is no usable value to show.
 * The value is kept in the query cache only; never write it to localStorage or sessionStorage.
 */
export type ParticipantCheckInStatus = "AVAILABLE" | "NOT_STARTED" | "ENDED" | "NOT_ELIGIBLE";

export type ParticipantCheckIn = {
  status: ParticipantCheckInStatus;
  code: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
};

const STATUSES: readonly string[] = ["AVAILABLE", "NOT_STARTED", "ENDED", "NOT_ELIGIBLE"];

export function getParticipantCheckIn(signal?: AbortSignal): Promise<ParticipantCheckIn> {
  return apiRequest<unknown>("/api/v1/participant/check-in", { signal }).then(parse);
}

function parse(value: unknown): ParticipantCheckIn {
  if (
    typeof value !== "object" ||
    value === null ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !STATUSES.includes(value.status)
  ) {
    throw unexpected();
  }
  const record = value as Record<string, unknown>;
  const status = record.status as ParticipantCheckInStatus;
  const code = typeof record.code === "string" && record.code.length > 0 ? record.code : null;
  if (status === "AVAILABLE" && code === null) throw unexpected();
  const checkedIn = record.checkedIn === true;
  const checkedInAt = checkedIn && typeof record.checkedInAt === "string" ? record.checkedInAt : null;
  return { status, code: status === "AVAILABLE" ? code : null, checkedIn, checkedInAt };
}

function unexpected(): ApiError {
  return new ApiError({ status: 200, code: "UNEXPECTED" });
}
