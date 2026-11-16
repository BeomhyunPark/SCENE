import { apiRequest } from "./client";
import { ApiError } from "./errors";

/** One retrospective per event (#237). A missing one is text "" and version 0. */
export type Retrospective = {
  text: string;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

/** Provisional server limit. */
export const RETROSPECTIVE_MAX = 10_000;

export function getRetrospective(eventId: string, signal?: AbortSignal): Promise<Retrospective> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/retrospective`, { signal }).then(parse);
}

export function saveRetrospective(
  eventId: string,
  input: { text: string; expectedVersion: number },
): Promise<Retrospective> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/retrospective`, {
    method: "PUT",
    body: input,
  }).then(parse);
}

function parse(value: unknown): Retrospective {
  if (
    !isRecord(value) ||
    typeof value.text !== "string" ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 0 ||
    !(value.updatedAt === null || typeof value.updatedAt === "string") ||
    !(value.updatedByDisplayName === null || typeof value.updatedByDisplayName === "string")
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return {
    text: value.text,
    version: value.version,
    updatedAt: value.updatedAt,
    updatedByDisplayName: value.updatedByDisplayName,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
