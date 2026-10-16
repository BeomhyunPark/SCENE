import { apiRequest } from "./client";
import type { ItemPage } from "./types";

export type SpaceRole = "OWNER" | "ADMIN" | "MEMBER";

export type SpaceListItem = {
  spaceId: string;
  name: string;
  role: SpaceRole;
};

export function listMySpaces(): Promise<ItemPage<SpaceListItem>> {
  return apiRequest<ItemPage<SpaceListItem>>("/api/v1/operator/spaces");
}
