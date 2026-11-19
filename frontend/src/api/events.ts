import { apiRequest } from "./client";
import type { ItemPage } from "./types";

export type LifecycleStatus = "DRAFT" | "ACTIVE" | "ENDED" | "ARCHIVED";

export type EventType =
  | "RETREAT"
  | "VISION_TRIP"
  | "OUTREACH"
  | "SHORT_TERM_MISSION"
  | "BIBLE_SCHOOL"
  | "CAMP"
  | "WORKSHOP"
  | "OTHER";

export type EventListItem = {
  eventId: string;
  name: string;
  lifecycleStatus: LifecycleStatus;
  startDate: string | null;
  endDate: string | null;
  place: string | null;
  eventType: EventType | null;
};

export type EventDetail = EventListItem & {
  lifecycleVersion: number;
  /** The organization that runs the event (#387). An event-only collaborator sees it too. */
  spaceId: string;
  spaceName: string;
};

export type OperatorEventRole = "OWNER" | "MANAGER" | "STAFF";

/**
 * One event I operate, in any organization (GET /api/v1/operator/events, #387). `spaceMember` is
 * false for an event-only collaborator (DEC-039, DEC-060), such as someone who left the organization.
 */
export type OperatedEventItem = EventListItem & {
  spaceId: string;
  spaceName: string;
  eventRole: OperatorEventRole;
  spaceMember: boolean;
};

export type CreateEventInput = {
  name: string;
  startDate?: string;
  endDate?: string;
  place?: string;
  eventType?: EventType;
};

export function listEvents(
  spaceId: string,
  query: { page: number; size: number },
  signal?: AbortSignal,
): Promise<ItemPage<EventListItem>> {
  return apiRequest<ItemPage<EventListItem>>(`/api/v1/operator/spaces/${spaceId}/events`, {
    query: { page: query.page, size: query.size },
    signal,
  });
}

/** Events I operate, whether or not I am a member of their organization (#387). */
export function listOperatedEvents(
  query: { page: number; size: number },
  signal?: AbortSignal,
): Promise<ItemPage<OperatedEventItem>> {
  return apiRequest<ItemPage<OperatedEventItem>>("/api/v1/operator/events", {
    query: { page: query.page, size: query.size },
    signal,
  });
}

export function createEvent(spaceId: string, input: CreateEventInput): Promise<EventDetail> {
  const body: Record<string, string> = { name: input.name };
  if (input.startDate) body.startDate = input.startDate;
  if (input.endDate) body.endDate = input.endDate;
  if (input.place) body.place = input.place;
  if (input.eventType) body.eventType = input.eventType;
  return apiRequest<EventDetail>(`/api/v1/operator/spaces/${spaceId}/events`, {
    method: "POST",
    body,
  });
}

export function getEvent(eventId: string): Promise<EventDetail> {
  return apiRequest<EventDetail>(`/api/v1/operator/events/${eventId}`);
}
