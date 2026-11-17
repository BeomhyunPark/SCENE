import { describe, expect, it } from "vitest";
import type { ApplicationTable, TableColumn, TableRow } from "../../api/applications";
import {
  applyFilters,
  buildColumns,
  copyText,
  countBy,
  groupRows,
  moveColumn,
  crossCount,
  NONE,
  OTHER,
  readView,
  sortRows,
  summarize,
  toggleSort,
  visibleColumns,
  writeView,
  type ColumnDef,
} from "./model";

function column(fieldId: string, label: string, answerType: TableColumn["answerType"], extra: Partial<TableColumn> = {}): TableColumn {
  return {
    fieldId,
    kind: "CUSTOM",
    systemKey: null,
    presetKey: null,
    label,
    position: 0,
    answerType,
    hidden: false,
    config: {},
    contact: false,
    ...extra,
  };
}

const option = (optionId: string, label: string, group: string | null = null, hidden = false) => ({
  optionId,
  label,
  group,
  hidden,
  showWhen: null,
});

const COLUMNS: TableColumn[] = [
  column("name", "이름", "SHORT_TEXT", { kind: "SYSTEM", systemKey: "NAME", position: 0 }),
  column("phone", "전화", "SHORT_TEXT", { kind: "SYSTEM", systemKey: "PHONE", position: 1, contact: true }),
  column("cohort", "또래", "SHORT_TEXT", { kind: "SYSTEM", systemKey: "COHORT", position: 2 }),
  column("gender", "성별", "SINGLE_CHOICE", {
    presetKey: "GENDER",
    position: 3,
    config: { options: [option("m", "남"), option("f", "여")] },
  }),
  column("middle", "중그룹", "SHORT_TEXT", { presetKey: "MIDDLE_GROUP", position: 4 }),
  column("cell", "셀", "SHORT_TEXT", { presetKey: "CELL", position: 5 }),
  column("attendance", "참석 방식", "SINGLE_CHOICE", {
    presetKey: "ATTENDANCE",
    position: 6,
    config: { options: [option("full", "전체 참석"), option("partial", "부분 참석")] },
  }),
  column("meals", "식사", "MULTI_CHOICE", {
    position: 7,
    config: {
      allowOther: true,
      options: [option("d1", "저녁", "1일차"), option("d2", "아침", "2일차"), option("old", "옛 보기", null, true)],
    },
  }),
  column("age", "나이", "NUMBER", { position: 8, config: { unit: "세" } }),
  column("arrive", "도착일", "DATE", { position: 9 }),
  column("consent", "동의", "YES_NO", { position: 10, config: { style: "CONSENT" } }),
  column("memo", "메모", "LONG_TEXT", { position: 11, hidden: true }),
];

function row(id: string, answers: Record<string, Record<string, unknown>>, extra: Partial<TableRow> = {}): TableRow {
  return { applicationId: id, submittedAt: `2026-12-1${id}T03:00:00Z`, answers, group: null, checkedInAt: null, ...extra };
}

const ROWS: TableRow[] = [
  row("1", {
    name: { text: "김하나" },
    phone: { text: "010-1111-2222" },
    cohort: { text: "94" },
    gender: { optionId: "f" },
    middle: { text: "청년2부" },
    cell: { text: "소망셀" },
    attendance: { optionId: "full" },
    meals: { optionIds: ["d1", "d2"] },
    age: { number: 32 },
    arrive: { date: "2027-01-22" },
    consent: { value: true },
  }, { group: { groupId: "g2", name: "2조", leader: true }, checkedInAt: "2027-01-22T01:00:00Z" }),
  row("2", {
    name: { text: "박둘" },
    phone: { text: "010-3333-4444" },
    cohort: { text: "95" },
    gender: { optionId: "m" },
    middle: { text: "청년2부" },
    attendance: { optionId: "partial" },
    meals: { optionIds: ["d1"], other: "간식" },
    age: { number: 29 },
    arrive: { date: "2027-01-23" },
    consent: { value: false },
  }),
  row("3", {
    name: { text: "이셋" },
    phone: { text: "010-5555-6666" },
    cohort: { text: "94" },
    gender: { optionId: "m" },
    attendance: { optionId: "full" },
    memo: { text: "늦게 도착" },
  }, { group: { groupId: "g1", name: "1조", leader: false } }),
];

const TABLE: ApplicationTable = { formId: "form", contactVisible: true, groupVisible: true, columns: COLUMNS, rows: ROWS };
const COLS = buildColumns(TABLE);
const col = (id: string): ColumnDef => COLS.find((item) => item.id === id)!;
const names = (rows: TableRow[]) => rows.map((item) => item.answers.name.text);

describe("columns", () => {
  it("puts the design's columns first and every other question after, hidden by default", () => {
    expect(COLS.map((item) => item.label)).toEqual([
      "참가자",
      "소속",
      "연락처",
      "현재 상태",
      "조 배정",
      "참석 범위",
      "또래",
      "성별",
      "중그룹",
      "셀",
      "식사",
      "나이",
      "도착일",
      "동의",
      "메모 (숨김)",
      "제출 시각",
    ]);
    expect(visibleColumns(COLS, null).map((item) => item.id)).toEqual([
      "person",
      "affiliation",
      "phone",
      "status",
      "group",
      "attendance",
    ]);
  });

  it("names a person as 또래 then 이름, joins 소속, and shows group, arrival and options as text", () => {
    expect(col("person").text(ROWS[0])).toBe("94 김하나");
    expect(col("affiliation").text(ROWS[0])).toBe("청년2부 · 소망셀");
    expect(col("affiliation").text(ROWS[1])).toBe("청년2부");
    expect(col("group").text(ROWS[0])).toBe("2조 · 조장");
    expect(col("group").text(ROWS[1])).toBe("미배정");
    expect(col("status").text(ROWS[0])).toBe("도착 완료");
    expect(col("meals").text(ROWS[1])).toBe("1일차 저녁, 기타: 간식");
    expect(col("consent").text(ROWS[0])).toBe("동의함");
    expect(col("age").text(ROWS[0])).toBe("32 세");
    expect(col("memo").text(ROWS[0])).toBe("");
  });

  it("leaves out phone and group columns when the server did not send them", () => {
    const limited = buildColumns({
      ...TABLE,
      contactVisible: false,
      groupVisible: false,
      columns: COLUMNS.filter((item) => !item.contact),
    });
    expect(limited.map((item) => item.id)).not.toContain("phone");
    expect(limited.map((item) => item.id)).not.toContain("group");
  });

  it("hides and shows columns by id in the chosen order, keeping 참가자 first", () => {
    expect(visibleColumns(COLS, ["meals", "age"]).map((item) => item.id)).toEqual(["person", "meals", "age"]);
    expect(visibleColumns(COLS, ["age", "person", "meals", "gone"]).map((item) => item.id)).toEqual(["person", "age", "meals"]);
  });

  it("moves a column within the order and keeps 참가자 out of it", () => {
    expect(moveColumn(["person", "a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveColumn(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveColumn(["a", "b"], "a", 1)).toEqual(["b", "a"]);
  });
});

describe("filters", () => {
  it("keeps only rows that match every column, and any chosen option within one", () => {
    const rows = applyFilters(
      ROWS,
      COLS,
      {
        gender: { kind: "in", keys: ["m", "f"] },
        attendance: { kind: "in", keys: ["full"] },
      },
      "",
      "phone",
    );
    expect(names(rows)).toEqual(["김하나", "이셋"]);
    const both = applyFilters(
      ROWS,
      COLS,
      { gender: { kind: "in", keys: ["m"] }, attendance: { kind: "in", keys: ["full"] } },
      "",
      "phone",
    );
    expect(names(both)).toEqual(["이셋"]);
  });

  it("matches 응답 없음 for a missing answer, including a question hidden by its condition", () => {
    expect(names(applyFilters(ROWS, COLS, { meals: { kind: "in", keys: [NONE] } }, "", null))).toEqual(["이셋"]);
    expect(names(applyFilters(ROWS, COLS, { meals: { kind: "in", keys: [NONE, OTHER] } }, "", null))).toEqual([
      "박둘",
      "이셋",
    ]);
    expect(names(applyFilters(ROWS, COLS, { group: { kind: "in", keys: [NONE] } }, "", null))).toEqual(["박둘"]);
  });

  it("counts a multiple-choice answer under each chosen option", () => {
    expect(names(applyFilters(ROWS, COLS, { meals: { kind: "in", keys: ["d2"] } }, "", null))).toEqual(["김하나"]);
    expect(names(applyFilters(ROWS, COLS, { meals: { kind: "in", keys: ["d1"] } }, "", null))).toEqual(["김하나", "박둘"]);
  });

  it("filters text by contains, numbers and dates by range", () => {
    expect(names(applyFilters(ROWS, COLS, { memo: { kind: "text", query: "늦게" } }, "", null))).toEqual(["이셋"]);
    expect(names(applyFilters(ROWS, COLS, { age: { kind: "range", min: "30", max: "" } }, "", null))).toEqual(["김하나"]);
    expect(names(applyFilters(ROWS, COLS, { arrive: { kind: "range", min: "2027-01-23", max: "2027-01-31" } }, "", null))).toEqual([
      "박둘",
    ]);
  });

  it("searches name, 또래, 소속, and phone digits only with the phone column", () => {
    expect(names(applyFilters(ROWS, COLS, {}, "하나", "phone"))).toEqual(["김하나"]);
    expect(names(applyFilters(ROWS, COLS, {}, "소망", "phone"))).toEqual(["김하나"]);
    expect(names(applyFilters(ROWS, COLS, {}, "6666", "phone"))).toEqual(["이셋"]);
    expect(names(applyFilters(ROWS, COLS, {}, "6666", null))).toEqual([]);
  });
});

describe("sorting", () => {
  it("sorts by one column and keeps empty values last either way", () => {
    expect(names(sortRows(ROWS, COLS, [{ id: "age", dir: "asc" }]))).toEqual(["박둘", "김하나", "이셋"]);
    expect(names(sortRows(ROWS, COLS, [{ id: "age", dir: "desc" }]))).toEqual(["김하나", "박둘", "이셋"]);
  });

  it("breaks ties with the next key, and options sort in form order", () => {
    expect(
      names(
        sortRows(ROWS, COLS, [
          { id: "attendance", dir: "asc" },
          { id: "person", dir: "desc" },
        ]),
      ),
    ).toEqual(["이셋", "김하나", "박둘"]);
  });

  it("cycles a header ascending, descending, off, and adds keys with shift", () => {
    expect(toggleSort([], "age", false)).toEqual([{ id: "age", dir: "asc" }]);
    expect(toggleSort([{ id: "age", dir: "asc" }], "age", false)).toEqual([{ id: "age", dir: "desc" }]);
    expect(toggleSort([{ id: "age", dir: "desc" }], "age", false)).toEqual([]);
    expect(toggleSort([{ id: "age", dir: "asc" }], "person", true)).toEqual([
      { id: "age", dir: "asc" },
      { id: "person", dir: "asc" },
    ]);
    expect(toggleSort([{ id: "age", dir: "asc" }], "person", false)).toEqual([{ id: "person", dir: "asc" }]);
  });
});

describe("counting", () => {
  it("counts people per option with 응답 없음 last", () => {
    expect(countBy(ROWS, col("gender")).map((item) => [item.label, item.count])).toEqual([
      ["남", 2],
      ["여", 1],
      ["응답 없음", 0],
    ]);
  });

  it("counts a multiple-choice answer once per chosen option, hidden options marked", () => {
    expect(countBy(ROWS, col("meals")).map((item) => [item.label, item.count])).toEqual([
      ["1일차 저녁", 2],
      ["2일차 아침", 1],
      ["옛 보기 (숨김)", 0],
      ["기타", 1],
      ["응답 없음", 1],
    ]);
  });

  it("counts a text column by its distinct answers, like 또래", () => {
    expect(countBy(ROWS, col("cohort")).map((item) => [item.label, item.count])).toEqual([
      ["94", 2],
      ["95", 1],
      ["응답 없음", 0],
    ]);
  });

  it("crosses two columns with row and column totals", () => {
    const cross = crossCount(ROWS, col("gender"), col("cohort"));
    expect(cross.rows.map((item) => item.label)).toEqual(["남", "여", "응답 없음"]);
    expect(cross.columns.map((item) => item.label)).toEqual(["94", "95", "응답 없음"]);
    expect(cross.cells.m).toEqual({ "94": 1, "95": 1 });
    expect(cross.cells.f).toEqual({ "94": 1 });
    expect(cross.rowTotals).toEqual({ m: 2, f: 1 });
    expect(cross.columnTotals).toEqual({ "94": 2, "95": 1 });
  });

  it("crosses a multiple-choice column per option", () => {
    const cross = crossCount(ROWS, col("meals"), col("gender"));
    expect(cross.cells.d1).toEqual({ f: 1, m: 1 });
    expect(cross.cells[NONE]).toEqual({ m: 1 });
  });

  it("summarizes numbers and answered counts for the filtered rows", () => {
    expect(summarize(ROWS, col("age"))).toBe("합 61 · 평균 30.5 · 최소 29 · 최대 32");
    expect(summarize(ROWS, col("meals"))).toBe("응답 2 · 고유 3");
    expect(summarize(ROWS, col("cohort"))).toBe("응답 3 · 고유 2");
    expect(summarize(ROWS, col("person"))).toBe("3명");
    expect(summarize(ROWS, col("group"))).toBe("배정 2 · 2개 조");
    expect(summarize(ROWS, col("status"))).toBe("도착 1 · 전 2");
  });
});

describe("grouping and copying", () => {
  it("groups rows in option order, a multiple choice under each option, 응답 없음 last", () => {
    const groups = groupRows(ROWS, col("meals"));
    expect(groups.map((group) => [group.label, group.rows.length])).toEqual([
      ["1일차 저녁", 2],
      ["2일차 아침", 1],
      ["기타", 1],
      ["응답 없음", 1],
    ]);
    expect(groupRows(ROWS, col("group")).map((group) => [group.label, names(group.rows)])).toEqual([
      ["1조", ["이셋"]],
      ["2조", ["김하나"]],
      ["미배정", ["박둘"]],
    ]);
  });

  it("copies a range as tab-separated text of what is on screen", () => {
    expect(copyText(ROWS.slice(0, 2), [col("person"), col("phone"), col("meals")])).toBe(
      "94 김하나\t010-1111-2222\t1일차 저녁, 2일차 아침\n95 박둘\t010-3333-4444\t1일차 저녁, 기타: 간식",
    );
    const withBreak = { ...ROWS[2], answers: { ...ROWS[2].answers, memo: { text: "줄\n바꿈\t탭" } } };
    expect(copyText([withBreak], [col("memo")])).toBe("줄 바꿈 탭");
  });

  it("copies nothing of a phone column the reader was not sent", () => {
    const limited = buildColumns({ ...TABLE, contactVisible: false, columns: COLUMNS.filter((item) => !item.contact) });
    const shown = visibleColumns(limited, null);
    expect(copyText(ROWS, shown)).not.toMatch(/010-/);
  });
});

describe("address", () => {
  it("round-trips choices, ranges, sorts, columns and counting axes", () => {
    const view = {
      filters: {
        gender: { kind: "in" as const, keys: ["m", NONE] },
        age: { kind: "range" as const, min: "20", max: "" },
      },
      sorts: [
        { id: "age", dir: "desc" as const },
        { id: "person", dir: "asc" as const },
      ],
      visible: ["meals"],
      tab: "count" as const,
      countA: "gender",
      countB: "cohort",
      widths: { person: 220, age: 96 },
      density: "compact" as const,
      groupBy: "gender",
    };
    expect(readView(new URLSearchParams(writeView(view).toString()))).toEqual(view);
  });

  it("never writes a text search to the address", () => {
    const params = writeView({
      filters: { memo: { kind: "text", query: "김하나 전화" } },
      sorts: [],
      visible: null,
      tab: "list",
      countA: null,
      countB: null,
      widths: {},
      density: "comfortable",
      groupBy: null,
    });
    expect(params.toString()).toBe("");
  });
});
