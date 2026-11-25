/**
 * The room of the latest room publication as the 참가 현황 table and the 현장 운영 desk show it (G5 #460,
 * DEC-085 §10, backend/docs/api.md "숙소"). The working copy's room never comes here. `lodging` is the
 * participant's lodging state now (the room board's rule), so a blank room can read as "숙박 안 함".
 */
export type Lodging = "LODGING" | "NOT_LODGING" | "UNKNOWN";

/** Room on a roster item and a check-in result. */
export type DeskRoom = { name: string; locationNote: string | null };

/** Room on a 참가 현황 table row. */
export type TableRoom = { roomId: string; name: string };

export const NOT_LODGING_LABEL = "숙박 안 함";

const LODGINGS: readonly Lodging[] = ["LODGING", "NOT_LODGING", "UNKNOWN"];

/** Null for anything else, so an older server reads as "unknown". */
export function parseLodging(value: unknown): Lodging | null {
  return LODGINGS.includes(value as Lodging) ? (value as Lodging) : null;
}

export function parseDeskRoom(value: unknown): DeskRoom | null {
  if (typeof value !== "object" || value === null) return null;
  const room = value as Record<string, unknown>;
  if (typeof room.name !== "string") return null;
  return { name: room.name, locationNote: typeof room.locationNote === "string" && room.locationNote ? room.locationNote : null };
}

export function parseTableRoom(value: unknown): TableRoom | null {
  if (typeof value !== "object" || value === null) return null;
  const room = value as Record<string, unknown>;
  return typeof room.roomId === "string" && typeof room.name === "string" ? { roomId: room.roomId, name: room.name } : null;
}

/**
 * The desk's words for one person: "301호 · 본관 3층", "숙박 안 함", or null when there is nothing to
 * say (before the publication, or a lodging person not in a room yet).
 */
export function deskRoomText(room: DeskRoom | null, lodging: Lodging | null): string | null {
  if (room) return room.locationNote ? `${room.name} · ${room.locationNote}` : room.name;
  return lodging === "NOT_LODGING" ? NOT_LODGING_LABEL : null;
}

/** " 방: 301호 · 본관 3층" or " (숙박 안 함)" to put after a check-in notice, or "" with nothing to tell. */
export function roomNoticeSuffix(room: DeskRoom | null, lodging: Lodging | null): string {
  const text = deskRoomText(room, lodging);
  if (!text) return "";
  return room ? ` 방: ${text}` : ` (${text})`;
}
