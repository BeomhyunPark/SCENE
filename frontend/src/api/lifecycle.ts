import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { LifecycleStatus } from "./events";

export type LifecycleOutcome = "TRANSITIONED" | "ALREADY_IN_STATE";

export type LifecycleResult = {
  outcome: LifecycleOutcome;
  lifecycleStatus: LifecycleStatus;
  lifecycleVersion: number;
  actedAs: string;
};

export function activateEvent(eventId: string, expectedLifecycleVersion: number): Promise<LifecycleResult> {
  return apiRequest(`/api/v1/operator/events/${eventId}/activate`, {
    method: "POST",
    body: { expectedLifecycleVersion },
  });
}

export function endEvent(
  eventId: string,
  body: { expectedLifecycleVersion: number; acknowledgeWarnings?: boolean },
): Promise<LifecycleResult> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/end`, {
    method: "POST",
    body,
  }).then(parseResult);
}

function parseResult(value: unknown): LifecycleResult {
  if (
    !isRecord(value) ||
    (value.outcome !== "TRANSITIONED" && value.outcome !== "ALREADY_IN_STATE") ||
    !isLifecycleStatus(value.lifecycleStatus) ||
    typeof value.lifecycleVersion !== "number" ||
    !Number.isFinite(value.lifecycleVersion) ||
    typeof value.actedAs !== "string"
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return {
    outcome: value.outcome,
    lifecycleStatus: value.lifecycleStatus,
    lifecycleVersion: value.lifecycleVersion,
    actedAs: value.actedAs,
  };
}

function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "ENDED" || value === "ARCHIVED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
