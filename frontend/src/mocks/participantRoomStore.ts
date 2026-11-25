import { bumpFeed } from "./participantFeedStore";
import { currentApplicationRevision } from "./participantStore";

/**
 * Shaped like GET /api/v1/participant/rooms (api.md "숙소", DEC-085 §9, G4 #459). It holds only what
 * the participant read needs: the latest published snapshot, the event's `roomRosterScope` and who
 * does not stay overnight. The operator board (G3 #458) can publish into it with
 * `publishParticipantRooms`; tests and mock clicks call it directly (`window.sceneMock.rooms`).
 * Publishing and a scope change after a publication raise `updates.rooms` like the server.
 */
export type RoomRosterScope = "ALL" | "ROOMMATES" | "MY_ROOM";

export type PublishedRoomMember = { participantId: string; name: string; cohort: string | null; gender: string | null };
export type PublishedRoom = {
  roomId: string;
  name: string;
  locationNote?: string | null;
  genderLabel?: string | null;
  members: PublishedRoomMember[];
};

type Publication = { publishedAt: string; rooms: PublishedRoom[] };

const publications = new Map<string, Publication>();
const scopes = new Map<string, RoomRosterScope>();
const notLodging = new Map<string, Set<string>>();

export function resetParticipantRoomStore(): void {
  publications.clear();
  scopes.clear();
  notLodging.clear();
}

/** A room publication (`PUBLISHED`): replaces the snapshot and raises `updates.rooms` by one. */
export function publishParticipantRooms(eventId: string, rooms: PublishedRoom[], now = new Date()): void {
  publications.set(eventId, { publishedAt: now.toISOString(), rooms: rooms.map((room) => ({ ...room, members: [...room.members] })) });
  bumpFeed(eventId, "rooms");
}

/** `roomRosterScope` (participant settings). Raises `updates.rooms` only while a publication exists. */
export function setRoomRosterScope(eventId: string, scope: RoomRosterScope): void {
  const before = scopes.get(eventId) ?? "ALL";
  scopes.set(eventId, scope);
  if (before !== scope && publications.has(eventId)) bumpFeed(eventId, "rooms");
}

/** Marks a participant as `NOT_LODGING` (the server computes it from the application). */
export function setNotLodging(eventId: string, participantId: string, value: boolean): void {
  let set = notLodging.get(eventId);
  if (!set) notLodging.set(eventId, (set = new Set()));
  if (value) set.add(participantId);
  else set.delete(participantId);
}

export function readParticipantRooms(eventId: string, participantId: string) {
  const rosterScope = scopes.get(eventId) ?? "ALL";
  const lodgingOff = notLodging.get(eventId)?.has(participantId) ?? false;
  const none = { publishedAt: null, rosterScope, notLodging: lodgingOff, myRoom: null, rooms: null };
  if (currentApplicationRevision(participantId) === null) return { status: "NOT_ELIGIBLE" as const, ...none };
  const publication = publications.get(eventId);
  if (!publication) return { status: "NOT_PUBLISHED" as const, ...none };
  const rooms =
    rosterScope === "ALL"
      ? publication.rooms.map((room) => ({
          roomId: room.roomId,
          name: room.name,
          locationNote: room.locationNote ?? null,
          genderLabel: room.genderLabel ?? null,
          members: byName(room.members).map((member) => ({ name: member.name, cohort: member.cohort })),
        }))
      : null;
  const mine = publication.rooms.find((room) => room.members.some((member) => member.participantId === participantId));
  if (!mine) return { status: "UNASSIGNED" as const, ...none, publishedAt: publication.publishedAt, rooms };
  return {
    status: "ASSIGNED" as const,
    publishedAt: publication.publishedAt,
    rosterScope,
    notLodging: lodgingOff,
    myRoom: {
      roomId: mine.roomId,
      name: mine.name,
      locationNote: mine.locationNote ?? null,
      genderLabel: mine.genderLabel ?? null,
      members:
        rosterScope === "MY_ROOM"
          ? null
          : byName(mine.members).map((member) => ({
              name: member.name,
              cohort: member.cohort,
              gender: member.gender,
              me: member.participantId === participantId,
            })),
    },
    rooms,
  };
}

/** Name, then id (api.md "숙소"). */
function byName(members: PublishedRoomMember[]): PublishedRoomMember[] {
  return [...members].sort((a, b) => a.name.localeCompare(b.name, "ko") || a.participantId.localeCompare(b.participantId));
}
