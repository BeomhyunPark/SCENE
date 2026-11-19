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

/**
 * Changes an operator to MANAGER or STAFF (event OWNER only, #371). OWNER is never given here.
 * The same role still clears that person's individual permission rows. Not an operator is
 * 404 RESOURCE_NOT_FOUND and an archived event is 409 EVENT_ARCHIVED.
 */
export function changeOperatorRole(eventId: string, userId: string, role: AddOperatorRole): Promise<EventOperator> {
  return apiRequest(`/api/v1/operator/events/${eventId}/operators/${userId}`, {
    method: "PATCH",
    body: { role },
  });
}

/**
 * Removes an operator from the event (event OWNER only, #371). Their tasks lose the assignee.
 * Success is 200 with no body, and not an operator is 404 RESOURCE_NOT_FOUND.
 */
export function removeOperator(eventId: string, userId: string): Promise<void> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/operators/${userId}`, {
    method: "DELETE",
  }).then(() => undefined);
}

/**
 * Replaces one operator's personal permissions (event OWNER only, DEC-029). The body is the whole
 * set: overrides left out are removed. 422 PERMISSION_OWNER_NOT_OVERRIDABLE (target is OWNER),
 * PERMISSION_OWNER_ONLY, PERMISSION_NOT_OVERRIDABLE (EVENT_READ), and 409 EVENT_ARCHIVED when an
 * archived event's access would widen.
 */
export function replaceOperatorPermissions(
  eventId: string,
  userId: string,
  overrides: { grants: string[]; revokes: string[] },
): Promise<PermissionBody> {
  return apiRequest(`/api/v1/operator/events/${eventId}/operators/${userId}/permissions`, {
    method: "PUT",
    body: { grants: overrides.grants, revokes: overrides.revokes },
  });
}
