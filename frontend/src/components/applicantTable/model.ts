import type { ApplicationAnswer, ApplicationTable, TableColumn, TableRow, TableSlot } from "../../api/applications";
import { cohortSortKey, compareCohort } from "../cohort";
import type { AnswerType, FieldOption } from "../../api/forms";
import { formatAnswer, HIDDEN_MARK } from "../answerDisplay";
import { participantLabel } from "../participantLabel";

/**
 * 참가 현황 table model (#308). Pure functions over the server table: which columns there are, the
 * text of a cell, the buckets a row falls in for filtering and counting, sorting, and the parts of
 * the view that live in the address. The screen in ApplicantTable.tsx only renders this.
 */

export const NONE = "__none";
export const OTHER = "__other";
export const NONE_LABEL = "응답 없음";

export type ColumnType = "person" | "choice" | "multi" | "text" | "number" | "date" | "group" | "status";

export type Bucket = { key: string; label: string };

export type ColumnDef = {
  id: string;
  label: string;
  type: ColumnType;
  /** Shown before the operator changes the column set. */
  defaultVisible: boolean;
  /** Can be picked as a counting axis. */
  countable: boolean;
  /** Choices for an "in" filter and for counting, in display order. Text columns build theirs from the rows. */
  options?: Bucket[];
  text: (row: TableRow) => string;
  /** Bucket keys of the row; empty means no answer. A multiple-choice answer has one key per option. */
  buckets: (row: TableRow) => string[];
  sortValue: (row: TableRow) => string | number | null;
  /** Numeric value for the summary line. */
  number?: (row: TableRow) => number | null;
  /** Order of bucket labels found in the rows, when plain text order is wrong (또래). */
  compareBuckets?: (a: string, b: string) => number;
};

export type Filter =
  | { kind: "in"; keys: string[] }
  | { kind: "text"; query: string }
  | { kind: "range"; min: string; max: string };

export type Sort = { id: string; dir: "asc" | "desc" };

export type Density = "comfortable" | "compact";

export type ViewState = {
  filters: Record<string, Filter>;
  sorts: Sort[];
  /** Explicit visible column ids in screen order, or null for the default set. */
  visible: string[] | null;
  tab: "list" | "count";
  countA: string | null;
  countB: string | null;
  /** Column widths in px the operator dragged; others use the type's default. */
  widths: Record<string, number>;
  /** "comfortable" is the design's row cards; "compact" is sheet-like 36px lines. */
  density: Density;
  /** Rows grouped by this column, or null. */
  groupBy: string | null;
};

export const EMPTY_VIEW: ViewState = {
  filters: {},
  sorts: [],
  visible: null,
  tab: "list",
  countA: null,
  countB: null,
  widths: {},
  density: "comfortable",
  groupBy: null,
};

export const MIN_WIDTH = 64;
export const MAX_WIDTH = 640;

const CHOICE_TYPES: AnswerType[] = ["SINGLE_CHOICE", "DROPDOWN", "MULTI_CHOICE", "YES_NO"];

// --- columns ---

/**
 * Columns in screen order. The design's fixed columns come first (참가자, 소속, 연락처, 현재 상태, 조
 * 배정, 참석 범위); every other question follows in form order, hidden by default. 이름 lives in the
 * 참가자 column and is not repeated.
 */
export function buildColumns(table: ApplicationTable): ColumnDef[] {
  const bySystem = (key: string) => table.columns.find((column) => column.systemKey === key);
  const byPreset = (key: string) => table.columns.find((column) => column.presetKey === key);
  const name = bySystem("NAME");
  const cohort = bySystem("COHORT");
  const phone = bySystem("PHONE");
  const middle = byPreset("MIDDLE_GROUP");
  const cell = byPreset("CELL");
  const attendance = byPreset("ATTENDANCE");

  const personText = (row: TableRow) => {
    const nameText = name ? textOf(row.answers[name.fieldId]) : "";
    const cohortText = cohort && !cohort.hidden ? textOf(row.answers[cohort.fieldId]) : "";
    return participantLabel({ name: nameText || "이름 없음", cohort: cohortText || null });
  };
  const columns: ColumnDef[] = [
    {
      id: "person",
      label: "참가자",
      type: "person",
      defaultVisible: true,
      countable: false,
      text: personText,
      buckets: (row) => [personText(row)],
      // 또래 first by birth year (88 … 99, 00), then name; people without 또래 after them.
      sortValue: (row) => {
        const cohortText = cohort && !cohort.hidden ? textOf(row.answers[cohort.fieldId]).trim() : "";
        const nameText = name ? textOf(row.answers[name.fieldId]).trim() : "";
        return `${cohortText ? cohortSortKey(cohortText) : "c"} ${nameText || "이름 없음"}`;
      },
    },
  ];

  if (middle || cell) {
    const parts = [middle, cell].filter((column): column is TableColumn => column !== undefined);
    const text = (row: TableRow) =>
      parts
        .map((column) => textOf(row.answers[column.fieldId]).trim())
        .filter((part) => part.length > 0)
        .join(" · ");
    columns.push(textColumn("affiliation", "소속", true, text));
  }
  if (phone) columns.push({ ...questionColumn(phone), id: phone.fieldId, label: "연락처", defaultVisible: true, countable: false });
  columns.push({
    id: "status",
    label: "현재 상태",
    type: "status",
    defaultVisible: true,
    countable: true,
    options: [
      { key: "arrived", label: "도착 완료" },
      { key: "waiting", label: "도착 전" },
    ],
    text: (row) => (row.checkedInAt ? "도착 완료" : "도착 전"),
    buckets: (row) => [row.checkedInAt ? "arrived" : "waiting"],
    sortValue: (row) => (row.checkedInAt ? 1 : 0),
  });
  if (table.groupVisible) {
    const groups = new Map<string, string>();
    for (const row of table.rows) if (row.group) groups.set(row.group.groupId, row.group.name);
    const options = [...groups.entries()]
      .sort((a, b) => collate(a[1], b[1]))
      .map(([key, label]) => ({ key, label }));
    columns.push({
      id: "group",
      label: "조 배정",
      type: "group",
      defaultVisible: true,
      countable: true,
      options: [...options, { key: NONE, label: "미배정" }],
      text: (row) => (row.group ? row.group.name + (row.group.leader ? " · 조장" : "") : "미배정"),
      buckets: (row) => (row.group ? [row.group.groupId] : []),
      sortValue: (row) => row.group?.name ?? null,
    });
  }
  if (attendance) columns.push({ ...questionColumn(attendance), label: "참석 범위", defaultVisible: true });
  if (table.slots) columns.push(slotColumn(table.slots));

  const used = new Set([name, phone, attendance].filter(Boolean).map((column) => column!.fieldId));
  for (const column of [...table.columns].sort((a, b) => a.position - b.position)) {
    if (used.has(column.fieldId)) continue;
    const def = questionColumn(column);
    if (column.systemKey === "COHORT" && def.type === "text") {
      columns.push({
        ...def,
        sortValue: (row) => {
          const value = textOf(row.answers[column.fieldId]).trim();
          return value ? cohortSortKey(value) : null;
        },
        compareBuckets: compareCohort,
      });
    } else {
      columns.push(def);
    }
  }
  columns.push({
    id: "submitted",
    label: "제출 시각",
    type: "date",
    defaultVisible: false,
    countable: false,
    text: (row) => formatInstant(row.submittedAt),
    buckets: (row) => [row.submittedAt.slice(0, 10)],
    sortValue: (row) => row.submittedAt,
  });
  return columns;
}

export const UNKNOWN_SLOTS = "모름";

/** `1월 22일 (금)` → `금`; a label without a weekday stays as it is. */
function shortDay(slot: TableSlot): string {
  return /\(([^)]+)\)\s*$/.exec(slot.dayLabel)?.[1] ?? slot.dayLabel;
}

/**
 * The slots a person attends as runs of neighbouring slots: `금 저녁 ~ 토 점심`, or
 * `금 집회, 토 집회` when they skip. Null slot ids read "모름" (DEC-074, same rule as the board).
 */
export function slotSummary(slots: readonly TableSlot[], slotIds: readonly string[] | null): string {
  if (slotIds === null) return UNKNOWN_SLOTS;
  const attended = new Set(slotIds);
  const name = (slot: TableSlot) => `${shortDay(slot)} ${slot.label}`;
  const runs: string[] = [];
  let start: TableSlot | null = null;
  let previous: TableSlot | null = null;
  for (const slot of [...slots, null]) {
    if (slot && attended.has(slot.slotId)) {
      start ??= slot;
      previous = slot;
      continue;
    }
    if (start && previous) runs.push(start === previous ? name(start) : `${name(start)} ~ ${name(previous)}`);
    start = null;
    previous = null;
  }
  return runs.length > 0 ? runs.join(", ") : "없음";
}

/** 참석 일정: filter and count by slot ("토 점심에 있는 사람"), sort by the first slot. */
function slotColumn(slots: TableSlot[]): ColumnDef {
  const order = new Map(slots.map((slot, index) => [slot.slotId, index]));
  return {
    id: "slots",
    label: "참석 일정",
    type: "multi",
    defaultVisible: true,
    countable: true,
    options: [
      ...slots.map((slot) => ({ key: slot.slotId, label: `${slot.dayLabel} ${slot.label}` })),
      { key: NONE, label: UNKNOWN_SLOTS },
    ],
    text: (row) => slotSummary(slots, row.slotIds),
    buckets: (row) => (row.slotIds ?? []).filter((id) => order.has(id)),
    sortValue: (row) => {
      if (row.slotIds === null) return null;
      const first = row.slotIds.map((id) => order.get(id)).find((index) => index !== undefined);
      return first ?? slots.length;
    },
  };
}

function questionColumn(column: TableColumn): ColumnDef {
  const label = column.hidden ? `${column.label}${HIDDEN_MARK}` : column.label;
  const cellText = (row: TableRow) => {
    const value = row.answers[column.fieldId];
    return value ? formatAnswer(asAnswer(column, value)) : "";
  };
  if (CHOICE_TYPES.includes(column.answerType)) {
    const options = choiceOptions(column);
    const keys = (row: TableRow) => choiceKeys(column, row.answers[column.fieldId]);
    const order = new Map(options.map((option, index) => [option.key, index]));
    return {
      id: column.fieldId,
      label,
      type: column.answerType === "MULTI_CHOICE" ? "multi" : "choice",
      defaultVisible: false,
      countable: true,
      options: [...options, { key: NONE, label: NONE_LABEL }],
      text: cellText,
      buckets: keys,
      sortValue: (row) => {
        const first = keys(row)[0];
        return first === undefined ? null : (order.get(first) ?? options.length);
      },
    };
  }
  if (column.answerType === "NUMBER") {
    const value = (row: TableRow) => {
      const number = row.answers[column.fieldId]?.number;
      return typeof number === "number" ? number : null;
    };
    return {
      id: column.fieldId,
      label,
      type: "number",
      defaultVisible: false,
      countable: true,
      text: cellText,
      buckets: (row) => {
        const number = value(row);
        return number === null ? [] : [String(number)];
      },
      sortValue: value,
      number: value,
    };
  }
  if (column.answerType === "DATE" || column.answerType === "DATE_RANGE") {
    const value = (row: TableRow) => dateOf(row.answers[column.fieldId]);
    return {
      id: column.fieldId,
      label,
      type: "date",
      defaultVisible: false,
      countable: true,
      text: cellText,
      buckets: (row) => {
        const text = cellText(row);
        return text ? [text] : [];
      },
      sortValue: value,
    };
  }
  return textColumn(column.fieldId, label, false, cellText);
}

function textColumn(id: string, label: string, defaultVisible: boolean, text: (row: TableRow) => string): ColumnDef {
  return {
    id,
    label,
    type: "text",
    defaultVisible,
    countable: true,
    text,
    buckets: (row) => {
      const value = text(row).trim();
      return value ? [value] : [];
    },
    sortValue: (row) => text(row).trim() || null,
  };
}

function choiceOptions(column: TableColumn): Bucket[] {
  if (column.answerType === "YES_NO") {
    const yes = formatAnswer(asAnswer(column, { value: true }));
    const no = formatAnswer(asAnswer(column, { value: false }));
    return [
      { key: "true", label: yes },
      { key: "false", label: no },
    ];
  }
  const options: Bucket[] = (column.config.options ?? []).map((option: FieldOption) => {
    const text = option.group ? `${option.group} ${option.label}` : option.label;
    return { key: option.optionId, label: option.hidden ? `${text}${HIDDEN_MARK}` : text };
  });
  if (column.config.allowOther) options.push({ key: OTHER, label: "기타" });
  return options;
}

function choiceKeys(column: TableColumn, value: Record<string, unknown> | undefined): string[] {
  if (!value) return [];
  if (column.answerType === "YES_NO") return typeof value.value === "boolean" ? [String(value.value)] : [];
  const keys: string[] = [];
  if (typeof value.optionId === "string") keys.push(value.optionId);
  if (Array.isArray(value.optionIds)) {
    for (const id of value.optionIds) if (typeof id === "string") keys.push(id);
  }
  if (typeof value.other === "string") keys.push(OTHER);
  return keys;
}

function asAnswer(column: TableColumn, value: Record<string, unknown>): ApplicationAnswer {
  return {
    fieldId: column.fieldId,
    kind: column.kind,
    systemKey: column.systemKey,
    label: column.label,
    position: column.position,
    answerType: column.answerType,
    hidden: column.hidden,
    config: column.config,
    value,
  };
}

function textOf(value: Record<string, unknown> | undefined): string {
  return typeof value?.text === "string" ? value.text : "";
}

/** `YYYY-MM-DD` of a date answer, or the start of a range. */
function dateOf(value: Record<string, unknown> | undefined): string | null {
  if (!value) return null;
  for (const key of ["date", "dateTime", "start"]) {
    if (typeof value[key] === "string") return (value[key] as string).slice(0, 16);
  }
  return null;
}

/** Bucket labels of a column, including values that only exist in the rows (text columns, unknown options). */
export function bucketsOf(column: ColumnDef, rows: readonly TableRow[]): Bucket[] {
  const known = column.options ?? [];
  const seen = new Set(known.map((bucket) => bucket.key));
  const extra: Bucket[] = [];
  for (const row of rows) {
    for (const key of column.buckets(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      extra.push({ key, label: column.type === "choice" || column.type === "multi" ? "알 수 없는 보기" : key });
    }
  }
  if (column.type === "number") extra.sort((a, b) => Number(a.key) - Number(b.key));
  else extra.sort((a, b) => (column.compareBuckets ?? collate)(a.label, b.label));
  const none = known.find((bucket) => bucket.key === NONE);
  const listed = known.filter((bucket) => bucket.key !== NONE);
  return [...listed, ...extra, none ?? { key: NONE, label: NONE_LABEL }];
}

// --- filtering ---

export function matches(row: TableRow, column: ColumnDef, filter: Filter): boolean {
  if (filter.kind === "in") {
    if (filter.keys.length === 0) return true;
    const keys = column.buckets(row);
    if (keys.length === 0) return filter.keys.includes(NONE);
    return keys.some((key) => filter.keys.includes(key));
  }
  if (filter.kind === "text") {
    const query = filter.query.trim().toLowerCase();
    return query.length === 0 || column.text(row).toLowerCase().includes(query);
  }
  const value = column.sortValue(row);
  if (value === null) return filter.min === "" && filter.max === "";
  if (column.type === "number") {
    const number = Number(value);
    if (filter.min !== "" && number < Number(filter.min)) return false;
    if (filter.max !== "" && number > Number(filter.max)) return false;
    return true;
  }
  const text = String(value).slice(0, 10);
  if (filter.min !== "" && text < filter.min) return false;
  if (filter.max !== "" && text > filter.max) return false;
  return true;
}

export function isActive(filter: Filter | undefined): boolean {
  if (!filter) return false;
  if (filter.kind === "in") return filter.keys.length > 0;
  if (filter.kind === "text") return filter.query.trim().length > 0;
  return filter.min !== "" || filter.max !== "";
}

/**
 * Name, 또래, 소속 or phone digits. A query of digits also matches the end of a phone number,
 * but only when the reader has the phone column.
 */
export function searchMatches(row: TableRow, columns: readonly ColumnDef[], query: string, phoneId: string | null): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  for (const id of ["person", "affiliation"]) {
    const column = columns.find((item) => item.id === id);
    if (column && column.text(row).toLowerCase().includes(needle)) return true;
  }
  const digits = needle.replace(/\D/g, "");
  if (phoneId && digits.length > 0 && digits.length === needle.replace(/[\s-]/g, "").length) {
    const phone = textOf(row.answers[phoneId]).replace(/\D/g, "");
    if (phone.includes(digits)) return true;
  }
  return false;
}

export function applyFilters(
  rows: readonly TableRow[],
  columns: readonly ColumnDef[],
  filters: Record<string, Filter>,
  search: string,
  phoneId: string | null,
): TableRow[] {
  const active = Object.entries(filters)
    .filter(([, filter]) => isActive(filter))
    .map(([id, filter]) => ({ column: columns.find((column) => column.id === id), filter }))
    .filter((item): item is { column: ColumnDef; filter: Filter } => item.column !== undefined);
  return rows.filter(
    (row) =>
      searchMatches(row, columns, search, phoneId) && active.every(({ column, filter }) => matches(row, column, filter)),
  );
}

// --- sorting ---

/** Stable multi-column sort. Empty values go last in either direction. */
export function sortRows(rows: readonly TableRow[], columns: readonly ColumnDef[], sorts: readonly Sort[]): TableRow[] {
  const keyed = sorts
    .map((sort) => ({ column: columns.find((column) => column.id === sort.id), dir: sort.dir }))
    .filter((item): item is { column: ColumnDef; dir: Sort["dir"] } => item.column !== undefined);
  if (keyed.length === 0) return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const { column, dir } of keyed) {
        const left = column.sortValue(a.row);
        const right = column.sortValue(b.row);
        if (left === null && right === null) continue;
        if (left === null) return 1;
        if (right === null) return -1;
        const order =
          typeof left === "number" && typeof right === "number" ? left - right : collate(String(left), String(right));
        if (order !== 0) return dir === "asc" ? order : -order;
      }
      return a.index - b.index;
    })
    .map((item) => item.row);
}

/** Header click: a new column sorts ascending, then descending, then off. With `add`, it becomes a further key. */
export function toggleSort(sorts: readonly Sort[], id: string, add: boolean): Sort[] {
  const current = sorts.find((sort) => sort.id === id);
  const next: Sort | null = !current ? { id, dir: "asc" } : current.dir === "asc" ? { id, dir: "desc" } : null;
  if (add) {
    const rest = sorts.filter((sort) => sort.id !== id);
    if (!next) return rest;
    return current ? sorts.map((sort) => (sort.id === id ? next : sort)) : [...rest, next];
  }
  return next ? [next] : [];
}

// --- counting ---

export type CountRow = { key: string; label: string; count: number };

/** People per bucket. A multiple-choice answer counts once under each chosen option. */
export function countBy(rows: readonly TableRow[], column: ColumnDef): CountRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const keys = column.buckets(row);
    for (const key of keys.length === 0 ? [NONE] : new Set(keys)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return bucketsOf(column, rows).map((bucket) => ({ ...bucket, count: counts.get(bucket.key) ?? 0 }));
}

export type CrossTable = {
  rows: Bucket[];
  columns: Bucket[];
  /** cells[rowKey][columnKey] */
  cells: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  columnTotals: Record<string, number>;
};

export function crossCount(rows: readonly TableRow[], a: ColumnDef, b: ColumnDef): CrossTable {
  const rowBuckets = bucketsOf(a, rows);
  const columnBuckets = bucketsOf(b, rows);
  const cells: CrossTable["cells"] = {};
  const rowTotals: Record<string, number> = {};
  const columnTotals: Record<string, number> = {};
  for (const bucket of rowBuckets) cells[bucket.key] = {};
  for (const row of rows) {
    const aKeys = a.buckets(row);
    const bKeys = b.buckets(row);
    const left = aKeys.length === 0 ? [NONE] : [...new Set(aKeys)];
    const right = bKeys.length === 0 ? [NONE] : [...new Set(bKeys)];
    for (const x of left) {
      rowTotals[x] = (rowTotals[x] ?? 0) + 1;
      for (const y of right) cells[x][y] = (cells[x][y] ?? 0) + 1;
    }
    for (const y of right) columnTotals[y] = (columnTotals[y] ?? 0) + 1;
  }
  return { rows: rowBuckets, columns: columnBuckets, cells, rowTotals, columnTotals };
}

/**
 * The summary line under the table, over the filtered rows: people for 참가자, answered and
 * distinct counts for other columns, and sum, average, min and max for numbers.
 */
export function summarize(rows: readonly TableRow[], column: ColumnDef): string {
  if (column.type === "person") return `${rows.length}명`;
  if (column.type === "status") return `도착 ${rows.filter((row) => row.checkedInAt).length} · 전 ${rows.filter((row) => !row.checkedInAt).length}`;
  if (column.type === "group") {
    const groups = new Set(rows.flatMap((row) => (row.group ? [row.group.groupId] : [])));
    return `배정 ${rows.filter((row) => row.group).length} · ${groups.size}개 조`;
  }
  if (column.number) {
    const values = rows.map(column.number).filter((value): value is number => value !== null);
    if (values.length === 0) return "응답 0";
    const sum = values.reduce((total, value) => total + value, 0);
    return `합 ${round(sum)} · 평균 ${round(sum / values.length)} · 최소 ${Math.min(...values)} · 최대 ${Math.max(...values)}`;
  }
  const distinct = new Set<string>();
  let answered = 0;
  for (const row of rows) {
    const keys = column.buckets(row);
    if (keys.length === 0) continue;
    answered++;
    for (const key of keys) distinct.add(key);
  }
  return `응답 ${answered} · 고유 ${distinct.size}`;
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

// --- grouping ---

export type RowGroup = { key: string; label: string; rows: TableRow[] };

/**
 * Rows grouped by one column in its bucket order, empty groups left out. A multiple-choice answer
 * puts the row under each chosen option, the same rule as counting; 응답 없음 comes last.
 */
export function groupRows(rows: readonly TableRow[], column: ColumnDef): RowGroup[] {
  const byKey = new Map<string, TableRow[]>();
  for (const row of rows) {
    const keys = column.buckets(row);
    for (const key of keys.length === 0 ? [NONE] : new Set(keys)) {
      const list = byKey.get(key) ?? [];
      list.push(row);
      byKey.set(key, list);
    }
  }
  return bucketsOf(column, rows)
    .filter((bucket) => byKey.has(bucket.key))
    .map((bucket) => ({ ...bucket, rows: byKey.get(bucket.key)! }));
}

// --- copying ---

/**
 * A rectangle of cells as tab-separated text, the way a sheet copies. Only the text on screen goes
 * out, so a column the reader cannot see (phone without contact access) cannot be copied either.
 * Tabs and line breaks inside a cell become spaces.
 */
export function copyText(rows: readonly TableRow[], columns: readonly ColumnDef[]): string {
  const clean = (text: string) => text.replace(/[\t\r\n]+/g, " ");
  return rows.map((row) => columns.map((column) => clean(column.text(row))).join("\t")).join("\n");
}

// --- column order ---

/** Moves one id up or down the explicit column order. 참가자 stays first. */
export function moveColumn(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const next = order.filter((item) => item !== "person");
  const index = next.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= next.length) return [...next];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function defaultWidth(column: ColumnDef): number {
  if (column.type === "person") return 180;
  if (column.type === "status" || column.type === "number") return 120;
  if (column.type === "group") return 120;
  if (column.type === "date") return 150;
  if (column.type === "multi") return 220;
  return 170;
}

export function clampWidth(width: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
}

// --- address ---

/**
 * The view in the address: "in" filters, ranges, sorts, columns, tab and counting axes. Text
 * searches stay out on purpose: free text and names are personal (#308 D4).
 */
export function readView(params: URLSearchParams): ViewState {
  const filters: Record<string, Filter> = {};
  for (const [key, value] of params) {
    if (key.startsWith("f.")) {
      const id = key.slice(2);
      const existing = filters[id];
      const keys = existing?.kind === "in" ? existing.keys : [];
      filters[id] = { kind: "in", keys: [...keys, value] };
    } else if (key.startsWith("r.")) {
      const [min = "", max = ""] = value.split("~");
      filters[key.slice(2)] = { kind: "range", min, max };
    }
  }
  const sorts: Sort[] = params
    .getAll("sort")
    .map((value) => {
      const [id, dir] = value.split(":");
      return { id, dir: dir === "desc" ? "desc" : "asc" } as Sort;
    })
    .filter((sort) => sort.id);
  const cols = params.get("cols");
  const widths: Record<string, number> = {};
  for (const part of (params.get("w") ?? "").split(",")) {
    const [id, px] = part.split(":");
    const width = Number(px);
    if (id && Number.isFinite(width)) widths[id] = clampWidth(width);
  }
  return {
    filters,
    sorts,
    visible: cols === null ? null : cols.split(",").filter(Boolean),
    tab: params.get("view") === "count" ? "count" : "list",
    countA: params.get("a"),
    countB: params.get("b"),
    widths,
    density: params.get("density") === "compact" ? "compact" : "comfortable",
    groupBy: params.get("group"),
  };
}

export function writeView(view: ViewState): URLSearchParams {
  const params = new URLSearchParams();
  for (const [id, filter] of Object.entries(view.filters)) {
    if (!isActive(filter)) continue;
    if (filter.kind === "in") for (const key of filter.keys) params.append(`f.${id}`, key);
    if (filter.kind === "range") params.set(`r.${id}`, `${filter.min}~${filter.max}`);
  }
  for (const sort of view.sorts) params.append("sort", `${sort.id}:${sort.dir}`);
  if (view.visible) params.set("cols", view.visible.join(","));
  if (view.tab === "count") params.set("view", "count");
  if (view.countA) params.set("a", view.countA);
  if (view.countB) params.set("b", view.countB);
  const widths = Object.entries(view.widths ?? {});
  if (widths.length > 0) params.set("w", widths.map(([id, px]) => `${id}:${px}`).join(","));
  if (view.density === "compact") params.set("density", "compact");
  if (view.groupBy) params.set("group", view.groupBy);
  return params;
}

/** Visible columns: 참가자 first, then the explicit order, or the default set in canonical order. */
export function visibleColumns(columns: readonly ColumnDef[], visible: string[] | null): ColumnDef[] {
  if (!visible) return columns.filter((column) => column.defaultVisible);
  const byId = new Map(columns.map((column) => [column.id, column]));
  const person = columns.filter((column) => column.id === "person");
  const rest = visible
    .filter((id) => id !== "person")
    .map((id) => byId.get(id))
    .filter((column): column is ColumnDef => column !== undefined);
  return [...person, ...rest];
}

// --- text ---

export function collate(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true });
}

const INSTANT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatInstant(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : INSTANT.format(date);
}
