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
