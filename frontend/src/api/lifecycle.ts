import type { LifecycleStatus } from "./events";
import { apiRequest } from "./client";

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
