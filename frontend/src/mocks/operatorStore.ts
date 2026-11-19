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

function seedMemberships(): Membership[] {
  return [
    { ...localSpace, role: "OWNER", userId: localUsers[0].userId },
    { ...localSpace, role: "ADMIN", userId: localUsers[1].userId },
    { ...localSpace, role: "MEMBER", userId: localUsers[2].userId },
    { ...localSpace, role: "MEMBER", userId: localUsers[4].userId },
  ];
}

let memberships: Membership[] = seedMemberships();

/** The organization name is looked up from the space, like the server's join (#387). */
export type StoredEvent = Omit<EventDetail, "spaceName"> & { spaceId: string };

const spaceNames = new Map<string, string>([[localSpace.spaceId, localSpace.name]]);

/** Organization name of a space, members or not (#387). */
export function spaceNameOf(spaceId: string): string {
  return spaceNames.get(spaceId) ?? "";
}

/** A space this mock user is not a member of, so its events reach them only as a collaborator. */
export function addSpace(spaceId: string, name: string): void {
  spaceNames.set(spaceId, name);
}

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
  spaceNames.clear();
  spaceNames.set(localSpace.spaceId, localSpace.name);
  memberships = seedMemberships();
  operatorRequests.length = 0;
}

/** Whether the user is an active member of the space. */
export function isMemberOf(spaceId: string, userId: string): boolean {
  return memberships.some((membership) => membership.spaceId === spaceId && membership.userId === userId);
}

/** Active members of one space, in no particular order. */
export function membersOf(spaceId: string): Membership[] {
  return memberships.filter((membership) => membership.spaceId === spaceId);
}

/** Adds an active membership. A mock space invitation accept calls this (#362). */
export function addMembership(spaceId: string, userId: string, role: SpaceRole): void {
  if (memberships.some((membership) => membership.spaceId === spaceId && membership.userId === userId)) return;
  const name =
    memberships.find((membership) => membership.spaceId === spaceId)?.name ?? spaceNames.get(spaceId) ?? localSpace.name;
  memberships.push({ spaceId, name, role, userId });
}

/** Leaves a space, like a member's leave without kept events (#387). */
export function removeMembership(spaceId: string, userId: string): void {
  memberships = memberships.filter((membership) => !(membership.spaceId === spaceId && membership.userId === userId));
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

export function setLifecycle(eventId: string, lifecycleStatus: LifecycleStatus, lifecycleVersion: number): void {
  const event = events.find((item) => item.eventId === eventId);
  if (!event) return;
  event.lifecycleStatus = lifecycleStatus;
  event.lifecycleVersion = lifecycleVersion;
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
