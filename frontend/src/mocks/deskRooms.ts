import type { DeskRoom, Lodging, TableRoom } from "../api/deskRoom";

/**
 * Mock of the room publication as the 참가 현황 table, the CSV and 현장 운영 read it (G5 #460, server
 * `RoomDesk`). Nothing is published by default, so every room is null and every lodging UNKNOWN,
 * and older screens read as before. Tests publish with {@link publishDeskRooms}; the room board
 * itself (G3) is not mocked here. Module state is per test file.
 */
type Room = { roomId: string; name: string; locationNote: string | null };

let publications = new Map<string, { publishedAt: string; rooms: Map<string, Room> }>();
let lodgings = new Map<string, Map<string, Lodging>>();

export function resetDeskRooms(): void {
  publications = new Map();
  lodgings = new Map();
}

/** Publishes rooms: participant id → room. Replaces the event's last publication. */
export function publishDeskRooms(
  eventId: string,
  rooms: Record<string, Room>,
  publishedAt = "2027-01-20T03:00:00Z",
): void {
  publications.set(eventId, { publishedAt, rooms: new Map(Object.entries(rooms)) });
}

/** Sets participants' lodging state now (UNKNOWN by default). */
export function setDeskLodging(eventId: string, byParticipant: Record<string, Lodging>): void {
  lodgings.set(eventId, new Map(Object.entries(byParticipant)));
}

export function roomPublishedAt(eventId: string): string | null {
  return publications.get(eventId)?.publishedAt ?? null;
}

function publishedRoom(eventId: string, participantId: string): Room | null {
  return publications.get(eventId)?.rooms.get(participantId) ?? null;
}

export function deskLodging(eventId: string, participantId: string): Lodging {
  return lodgings.get(eventId)?.get(participantId) ?? "UNKNOWN";
}

/** `room` and `lodging` of a roster item or a check-in result. */
export function deskStay(eventId: string, participantId: string): { room: DeskRoom | null; lodging: Lodging } {
  const room = publishedRoom(eventId, participantId);
  return {
    room: room ? { name: room.name, locationNote: room.locationNote } : null,
    lodging: deskLodging(eventId, participantId),
  };
}

/** `room` and `lodging` of a 참가 현황 table row. */
export function tableStay(eventId: string, participantId: string): { room: TableRoom | null; lodging: Lodging } {
  const room = publishedRoom(eventId, participantId);
  return { room: room ? { roomId: room.roomId, name: room.name } : null, lodging: deskLodging(eventId, participantId) };
}

/** The CSV's 방 cell: the room name, 숙박 안 함, or blank (server `ApplicationExportService.roomCell`). */
export function roomCell(eventId: string, participantId: string | undefined): string {
  if (!participantId) return "";
  const room = publishedRoom(eventId, participantId);
  if (room) return room.name;
  return deskLodging(eventId, participantId) === "NOT_LODGING" ? "숙박 안 함" : "";
}
