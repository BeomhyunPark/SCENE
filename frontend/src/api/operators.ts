import { apiRequest } from "./client";
import type { ItemPage } from "./types";

export type EventOperator = {
  userId: string;
  displayName: string;
  role: string;
};

export type PermissionBody = {
  userId: string;
  role: string;
  roleDefaults: string[];
  overrides: { grants: string[]; revokes: string[] };
  effective: string[];
};

export function listOperators(eventId: string): Promise<ItemPage<EventOperator>> {
  return apiRequest(`/api/v1/operator/events/${eventId}/operators`, {
    query: { page: 0, size: 50 },
  });
}

export function getMyPermissions(eventId: string, userId: string): Promise<PermissionBody> {
  return apiRequest(`/api/v1/operator/events/${eventId}/operators/${userId}/permissions`);
}

/** Event roles the owner can pick when adding an organization member (DEC-076). */
export type AddOperatorRole = "MANAGER" | "STAFF";

/**
 * Adds an active space member to the event (event OWNER only). Already an operator is
 * 400 VALIDATION_FAILED on `userId`, not an active member is 404 RESOURCE_NOT_FOUND, and an
 * archived event is 409 EVENT_ARCHIVED.
 */
export function addOperator(eventId: string, input: { userId: string; role: AddOperatorRole }): Promise<EventOperator> {
  return apiRequest(`/api/v1/operator/events/${eventId}/operators`, {
    method: "POST",
    body: { userId: input.userId, role: input.role },
  });
}
