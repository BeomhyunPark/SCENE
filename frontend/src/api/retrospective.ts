import { apiRequest } from "./client";
import { isApiError } from "./errors";

/**
 * Provisional body. The server has no retrospective route yet.
 * The mock answers 404. The current API catch-all answers 500 without a code.
 */
export function retrospectiveMissing(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || (error.status === 500 && error.code === "UNEXPECTED"));
}

export function getRetrospective(eventId: string, signal?: AbortSignal): Promise<string | null> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/retrospective`, { signal })
    .then(readText)
    .catch((error: unknown) => {
      if (retrospectiveMissing(error)) return null;
      throw error;
    });
}

export function saveRetrospective(eventId: string, text: string): Promise<string> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/retrospective`, {
    method: "PUT",
    body: { text },
  }).then(readText);
}

function readText(value: unknown): string {
  if (!isRecord(value) || typeof value.text !== "string") {
    return "";
  }
  return value.text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
