import type { ApplicationTable, TableRow } from "../../api/applications";
import { NOT_LODGING_LABEL } from "../../api/deskRoom";
import type { ColumnDef } from "./model";

/**
 * 방 column of 참가 현황 (G5 #460, DEC-085 §10): the room of the latest room publication, never the
 * working copy. Filter keys are room ids, {@link NOT_LODGING} for a person without a published room
 * who sleeps no night, and the table's 미배정 (no key). Shown by default once rooms are published;
 * before that every cell is blank except 숙박 안 함, and the column stays in the 열 menu. A saved
 * column set keeps its own choice, like every other column.
 */
export const ROOM = "room";
export const NOT_LODGING = "__notLodging";
const NONE = "__none";

export function roomColumn(table: ApplicationTable): ColumnDef {
  const published = table.roomPublishedAt !== null;
  const rooms = new Map<string, string>();
  for (const row of table.rows) if (row.room) rooms.set(row.room.roomId, row.room.name);
  const options = [...rooms.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "ko", { numeric: true }))
    .map(([key, label]) => ({ key, label }));
  return {
    id: ROOM,
    label: "방",
    type: "room",
    defaultVisible: published,
    countable: published,
    options: [...options, { key: NOT_LODGING, label: NOT_LODGING_LABEL }, { key: NONE, label: "미배정" }],
    text: (row) => roomText(row, published),
    buckets: (row) => (row.room ? [row.room.roomId] : notLodging(row) ? [NOT_LODGING] : []),
    // Rooms by name, then 숙박 안 함, then nobody (blank sorts last on its own).
    sortValue: (row) => (row.room ? `0 ${row.room.name}` : notLodging(row) ? "1" : null),
  };
}

function notLodging(row: TableRow): boolean {
  return !row.room && row.lodging === "NOT_LODGING";
}

function roomText(row: TableRow, published: boolean): string {
  if (row.room) return row.room.name;
  if (notLodging(row)) return NOT_LODGING_LABEL;
  return published ? "미배정" : "";
}

/** "배정 12 · 3개 방" over the filtered rows. */
export function summarizeRooms(rows: readonly TableRow[]): string {
  const rooms = new Set(rows.flatMap((row) => (row.room ? [row.room.roomId] : [])));
  const away = rows.filter(notLodging).length;
  const base = `배정 ${rows.filter((row) => row.room).length} · ${rooms.size}개 방`;
  return away > 0 ? `${base} · ${NOT_LODGING_LABEL} ${away}` : base;
}
