import type { EventDetail, EventType, LifecycleStatus } from "../api/events";
import type { SpaceRole } from "../api/spaces";
import { localEvent, localSpace, localUsers } from "./fixtures/seed";

export const EVENT_TYPES: readonly EventType[] = [
  "RETREAT",
  "VISION_TRIP",
  "OUTREACH",
  "SHORT_TERM_MISSION",
  "BIBLE_SCHOOL",
  "CAMP",
  "WORKSHOP",
  "OTHER",
];

type Membership = { spaceId: string; name: string; role: SpaceRole; userId: string };

const memberships: Membership[] = [
  { ...localSpace, role: "OWNER", userId: localUsers[0].userId },
  { ...localSpace, role: "ADMIN", userId: localUsers[1].userId },
  { ...localSpace, role: "MEMBER", userId: localUsers[2].userId },
];

export type StoredEvent = EventDetail & { spaceId: string };

let events: StoredEvent[] = [seedEvent()];

export type LoggedRequest = {
  method: string;
  url: string;
  body?: unknown;
  response?: unknown;
};

export const operatorRequests: LoggedRequest[] = [];

export function resetOperatorStore(): void {
  events = [seedEvent()];
  operatorRequests.length = 0;
}

export function spacesFor(userId: string): Membership[] {
  return memberships
    .filter((membership) => membership.userId === userId)
    .sort((left, right) => left.name.localeCompare(right.name) || left.spaceId.localeCompare(right.spaceId));
}

export function eventsFor(spaceId: string): StoredEvent[] {
  return events.filter((event) => event.spaceId === spaceId);
}

export function eventById(eventId: string): StoredEvent | undefined {
  return events.find((event) => event.eventId === eventId);
}

export function addEvent(event: StoredEvent): void {
  events.push(event);
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

function seedEvent(): StoredEvent {
  return {
    eventId: localEvent.eventId,
    spaceId: localEvent.spaceId,
    name: localEvent.name,
    lifecycleStatus: localEvent.lifecycleStatus as LifecycleStatus,
    lifecycleVersion: 0,
    startDate: null,
    endDate: null,
    place: null,
    eventType: null,
  };
}
