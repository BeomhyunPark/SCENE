import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * The participant's room from the latest room publication (api.md "숙소" `GET /participant/rooms`,
 * DEC-085 §9). What shows depends on `rosterScope`:
 * - `ALL`: my room, its people (name·또래·성별) and every room with names·또래.
 * - `ROOMMATES`: my room and its people; `rooms` is null.
 * - `MY_ROOM`: my room's name and location only; `myRoom.members` and `rooms` are null.
 *
 * The parser keeps only the keys listed here, so a participant id, phone or answer the server might
 * add never reaches the screen. `roomId` is kept only to mark my room in the full table; it is not shown.
 * The value lives in the query cache only; never write it to localStorage or sessionStorage.
 */
export type ParticipantRoomStatus = "NOT_ELIGIBLE" | "NOT_PUBLISHED" | "UNASSIGNED" | "ASSIGNED";
export type RoomRosterScope = "ALL" | "ROOMMATES" | "MY_ROOM";

export type RoomMate = { name: string; cohort: string | null; gender: string | null; me: boolean };
export type RosterMember = { name: string; cohort: string | null };

export type MyRoom = {
  roomId: string;
  name: string;
  locationNote: string | null;
  genderLabel: string | null;
  members: RoomMate[] | null;
};

export type RosterRoom = {
  roomId: string;
  name: string;
  locationNote: string | null;
  genderLabel: string | null;
  members: RosterMember[];
};

export type ParticipantRooms = {
  status: ParticipantRoomStatus;
  publishedAt: string | null;
  rosterScope: RoomRosterScope;
  notLodging: boolean;
  myRoom: MyRoom | null;
  rooms: RosterRoom[] | null;
};

const STATUSES: readonly string[] = ["NOT_ELIGIBLE", "NOT_PUBLISHED", "UNASSIGNED", "ASSIGNED"];
const SCOPES: readonly string[] = ["ALL", "ROOMMATES", "MY_ROOM"];

export function getParticipantRooms(signal?: AbortSignal): Promise<ParticipantRooms> {
  return apiRequest<unknown>("/api/v1/participant/rooms", { signal }).then(parseParticipantRooms);
}

export function parseParticipantRooms(value: unknown): ParticipantRooms {
  const record = asRecord(value);
  if (!record || typeof record.status !== "string" || !STATUSES.includes(record.status)) throw unexpected();
  const status = record.status as ParticipantRoomStatus;
  // An unknown scope reads as the narrowest one, so a new server value never shows more than it meant.
  const rosterScope = (typeof record.rosterScope === "string" && SCOPES.includes(record.rosterScope)
    ? record.rosterScope
    : "MY_ROOM") as RoomRosterScope;
  const notLodging = record.notLodging === true;
  if (status === "NOT_ELIGIBLE" || status === "NOT_PUBLISHED") {
    return { status, publishedAt: null, rosterScope, notLodging, myRoom: null, rooms: null };
  }
  const publishedAt = typeof record.publishedAt === "string" ? record.publishedAt : null;
  const rooms = rosterScope === "ALL" ? parseRooms(record.rooms) : null;
  if (status === "UNASSIGNED") return { status, publishedAt, rosterScope, notLodging, myRoom: null, rooms };
  const myRoom = parseMyRoom(record.myRoom, rosterScope);
  if (!myRoom) throw unexpected();
  return { status, publishedAt, rosterScope, notLodging, myRoom, rooms };
}

function parseMyRoom(value: unknown, scope: RoomRosterScope): MyRoom | null {
  const record = asRecord(value);
  if (!record || typeof record.roomId !== "string" || typeof record.name !== "string") return null;
  return {
    roomId: record.roomId,
    name: record.name,
    locationNote: text(record.locationNote),
    genderLabel: text(record.genderLabel),
    members: scope === "MY_ROOM" || !Array.isArray(record.members) ? null : record.members.flatMap(parseMate),
  };
}

function parseMate(value: unknown): RoomMate[] {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string") return [];
  return [{ name: record.name, cohort: text(record.cohort), gender: text(record.gender), me: record.me === true }];
}

function parseRooms(value: unknown): RosterRoom[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item: unknown) => {
    const record = asRecord(item);
    if (!record || typeof record.roomId !== "string" || typeof record.name !== "string") return [];
    const members = Array.isArray(record.members)
      ? record.members.flatMap((member: unknown) => {
          const row = asRecord(member);
          return row && typeof row.name === "string" ? [{ name: row.name, cohort: text(row.cohort) }] : [];
        })
      : [];
    return [{ roomId: record.roomId, name: record.name, locationNote: text(record.locationNote), genderLabel: text(record.genderLabel), members }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function unexpected(): ApiError {
  return new ApiError({ status: 200, code: "UNEXPECTED" });
}
