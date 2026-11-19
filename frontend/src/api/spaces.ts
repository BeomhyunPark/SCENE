import { apiRequest } from "./client";
import type { ItemPage } from "./types";

export type SpaceRole = "OWNER" | "ADMIN" | "MEMBER";

export type SpaceListItem = {
  spaceId: string;
  name: string;
  role: SpaceRole;
};

/** Only an active space OWNER or ADMIN creates events; a MEMBER joins as an operator (DEC-077). */
export function mayCreateEvents(role: SpaceRole | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function listMySpaces(): Promise<ItemPage<SpaceListItem>> {
  return apiRequest<ItemPage<SpaceListItem>>("/api/v1/operator/spaces");
}
