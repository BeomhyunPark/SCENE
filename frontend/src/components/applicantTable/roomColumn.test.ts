import { describe, expect, it } from "vitest";
import { EMPTY_OPERATION, type ApplicationTable, type TableRow } from "../../api/applications";
import { applyFilters, buildColumns, bucketsOf, sortRows, summarize, visibleColumns } from "./model";
import { NOT_LODGING, ROOM } from "./roomColumn";

function row(id: string, extra: Partial<TableRow>): TableRow {
  return {
    applicationId: id,
    participantId: `p${id}`,
    submittedAt: "2026-12-15T03:00:00Z",
    answers: { name: { text: id } },
    group: null,
    checkedInAt: null,
    slotIds: null,
    operation: EMPTY_OPERATION,
    revision: 1,
    revisedBy: null,
    room: null,
    lodging: "LODGING",
    ...extra,
  };
}

const ROWS: TableRow[] = [
  row("가", { room: { roomId: "r10", name: "310호" } }),
  row("나", { room: { roomId: "r2", name: "302호" } }),
  row("다", {}),
  row("라", { lodging: "NOT_LODGING" }),
  row("마", { room: { roomId: "r2", name: "302호" } }),
];

function table(published: boolean): ApplicationTable {
  return {
    formId: "form",
    contactVisible: false,
    groupVisible: false,
    columns: [
      {
        fieldId: "name",
        kind: "SYSTEM",
        systemKey: "NAME",
        presetKey: null,
        label: "이름",
        position: 0,
        answerType: "SHORT_TEXT",
        hidden: false,
        config: {},
        contact: false,
      },
    ],
    rows: published ? ROWS : ROWS.map((item) => ({ ...item, room: null })),
    slots: null,
    withdrawn: [],
    roomPublishedAt: published ? "2027-01-20T03:00:00Z" : null,
  };
}

const names = (rows: readonly TableRow[]) => rows.map((item) => item.applicationId);

describe("방 column (G5 #460)", () => {
  const columns = buildColumns(table(true));
  const room = columns.find((item) => item.id === ROOM)!;

  it("shows the published room, 숙박 안 함 and 미배정, and is on by default once published", () => {
    expect(ROWS.map(room.text)).toEqual(["310호", "302호", "미배정", "숙박 안 함", "302호"]);
    expect(visibleColumns(columns, null).map((item) => item.id)).toContain(ROOM);
    expect(room.countable).toBe(true);
  });

  it("is blank and off by default before the first publication, except 숙박 안 함", () => {
    const before = buildColumns(table(false));
    const blank = before.find((item) => item.id === ROOM)!;
    expect(table(false).rows.map(blank.text)).toEqual(["", "", "", "숙박 안 함", ""]);
    expect(visibleColumns(before, null).map((item) => item.id)).not.toContain(ROOM);
  });

  it("filters by room, 숙박 안 함 and 미배정, with rooms in natural name order", () => {
    expect(bucketsOf(room, ROWS).map((item) => item.label)).toEqual(["302호", "310호", "숙박 안 함", "미배정"]);
    expect(names(applyFilters(ROWS, columns, { [ROOM]: { kind: "in", keys: ["r2"] } }, "", null))).toEqual(["나", "마"]);
    expect(names(applyFilters(ROWS, columns, { [ROOM]: { kind: "in", keys: [NOT_LODGING] } }, "", null))).toEqual(["라"]);
    expect(names(applyFilters(ROWS, columns, { [ROOM]: { kind: "in", keys: ["__none"] } }, "", null))).toEqual(["다"]);
  });

  it("sorts rooms by name, then 숙박 안 함, then nobody, and sums up the filtered rows", () => {
    expect(names(sortRows(ROWS, columns, [{ id: ROOM, dir: "asc" }]))).toEqual(["나", "마", "가", "라", "다"]);
    expect(summarize(ROWS, room)).toBe("배정 3 · 2개 방 · 숙박 안 함 1");
  });
});
