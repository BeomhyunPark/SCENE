import type { TableRow } from "../../api/applications";
import {
  cellKey,
  OPERATOR_COLUMN,
  OPERATOR_ROW,
  PARTICIPANT_ROW,
  type CellFormat,
  type SheetDoc,
  type SheetRule,
} from "../../api/rosterSheet";
import { columnIndex, columnLetter, evaluate, formatNumber, isError, parseNumber, rewriteRefs, toText, type Scalar } from "./formula";
import type { ColumnDef } from "./model";

/**
 * The 참가 현황 sheet (#509): participant rows and operator rows, table columns and operator
 * columns, and the values formulas see. Formulas are typed in A1 notation but stored with column ids
 * and row keys (`[[colId@rowKey]]`, `[[colId]]` for a whole column), so a new applicant, a moved
 * column or another operator's view never changes what a formula points at.
 *
 * - Column letters follow the reader's column order: the shown columns, then the hidden ones.
 * - Row numbers are fixed: participants in submission order, then the operator rows. Sorting and
 *   filtering only change which rows are drawn where, as in a Sheets filter view.
 */

export type SheetRowRef =
  | { kind: "participant"; key: string; row: TableRow; number: number }
  | { kind: "operator"; key: string; id: string; number: number };

export const participantKey = (row: TableRow) => PARTICIPANT_ROW + (row.participantId || row.applicationId);
export const operatorKey = (id: string) => OPERATOR_ROW + id;
export const isOperatorColumn = (id: string) => id.startsWith(OPERATOR_COLUMN);

export type Layout = {
  colIds: string[];
  rowKeys: string[];
  colAt: Map<string, number>;
  rowAt: Map<string, number>;
};

export function layoutOf(colIds: string[], rowKeys: string[]): Layout {
  return {
    colIds,
    rowKeys,
    colAt: new Map(colIds.map((id, index) => [id, index])),
    rowAt: new Map(rowKeys.map((key, index) => [key, index])),
  };
}

const STORED = /\[\[(\$?)([^@\]]+?)(?:@(\$?)([^\]]+))?\]\]/g;

/** "=SUM(B2:B9)" as the reader typed it → stored with ids. Text that is not a formula is kept. */
export function toStored(raw: string, layout: Layout): string {
  if (!raw.startsWith("=")) return raw;
  return (
    "=" +
    rewriteRefs(raw.slice(1), ({ col, row, absCol, absRow }) => {
      const colId = layout.colIds[col];
      if (colId === undefined) return null;
      if (row === null) return `[[${absCol ? "$" : ""}${colId}]]`;
      const rowKey = layout.rowKeys[row];
      if (rowKey === undefined) return null;
      return `[[${absCol ? "$" : ""}${colId}@${absRow ? "$" : ""}${rowKey}]]`;
    })
  );
}

/** Stored formula → A1 text in the reader's layout. A column or row that is gone reads #REF!. */
export function toA1(stored: string, layout: Layout): string {
  if (!stored.startsWith("=") || !stored.includes("[[")) return stored;
  return stored.replace(STORED, (_all, absCol: string, colId: string, absRow: string | undefined, rowKey: string | undefined) => {
    const col = layout.colAt.get(colId);
    if (col === undefined) return "#REF!";
    const letter = `${absCol}${columnLetter(col)}`;
    if (rowKey === undefined) return letter;
    const row = layout.rowAt.get(rowKey);
    if (row === undefined) return "#REF!";
    return `${letter}${absRow ?? ""}${row + 1}`;
  });
}

/** A typed value: numbers become numbers, the rest stays text. */
export function literal(text: string): Scalar {
  if (text === "") return null;
  const upper = text.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  if (/^-?[0-9][0-9,]*(\.[0-9]+)?$|^-?\.[0-9]+$/.test(text.trim())) return parseNumber(text);
  return text;
}

export class Workbook {
  readonly layout: Layout;
  private readonly byId: Map<string, ColumnDef>;
  private readonly rowByKey: Map<string, TableRow>;
  private readonly cache = new Map<string, Scalar>();
  private readonly busy = new Set<string>();

  constructor(
    readonly doc: SheetDoc,
    columns: readonly ColumnDef[],
    /** Column ids in letter order. */
    colOrder: readonly string[],
    readonly rows: readonly SheetRowRef[],
  ) {
    this.byId = new Map(columns.map((column) => [column.id, column]));
    this.rowByKey = new Map(rows.flatMap((row) => (row.kind === "participant" ? [[row.key, row.row] as const] : [])));
    this.layout = layoutOf([...colOrder], rows.map((row) => row.key));
  }

  /** The stored text of a cell the sheet holds (operator columns, operator rows). */
  stored(rowKey: string, colId: string): string {
    return this.doc.cells[cellKey(rowKey, colId)]?.v ?? "";
  }

  /** What the editor and the formula bar show: a formula in A1, or the plain text. */
  raw(rowKey: string, colId: string): string {
    const holds = rowKey.startsWith(OPERATOR_ROW) || isOperatorColumn(colId);
    if (holds) return toA1(this.stored(rowKey, colId), this.layout);
    const row = this.rowByKey.get(rowKey);
    const column = this.byId.get(colId);
    return row && column ? column.text(row) : "";
  }

  value(rowKey: string, colId: string, inRange = false): Scalar {
    const key = cellKey(rowKey, colId);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    // A range that holds the formula's own cell skips it, as a total under its column needs.
    if (this.busy.has(key)) return inRange ? null : { error: "#CIRC!" };
    this.busy.add(key);
    let out: Scalar;
    try {
      out = this.compute(rowKey, colId);
    } finally {
      this.busy.delete(key);
    }
    this.cache.set(key, out);
    return out;
  }

  private compute(rowKey: string, colId: string): Scalar {
    const holds = rowKey.startsWith(OPERATOR_ROW) || isOperatorColumn(colId);
    if (holds) {
      const stored = this.stored(rowKey, colId);
      if (!stored.startsWith("=")) return literal(stored);
      return evaluate(toA1(stored, this.layout).slice(1), {
        rowCount: this.layout.rowKeys.length,
        colCount: this.layout.colIds.length,
        cell: (c, r, inRange) => this.value(this.layout.rowKeys[r], this.layout.colIds[c], inRange),
      });
    }
    const row = this.rowByKey.get(rowKey);
    const column = this.byId.get(colId);
    if (!row || !column) return null;
    const n = column.number?.(row);
    if (n !== undefined && n !== null) return n;
    const text = column.text(row);
    if (column.type === "status" || column.type === "group" || column.type === "room") return text || null;
    return literal(text);
  }

  display(rowKey: string, colId: string): string {
    const value = this.value(rowKey, colId);
    if (typeof value === "number") return formatNumber(value);
    return toText(value);
  }

  isFormula(rowKey: string, colId: string): boolean {
    return this.stored(rowKey, colId).startsWith("=");
  }

  /** The cell's own format with every matching conditional rule laid over it. */
  format(rowKey: string, colId: string): CellFormat | undefined {
    const own = this.doc.cells[cellKey(rowKey, colId)]?.f;
    const rules = this.doc.rules.filter((rule) => rule.col === colId);
    if (rules.length === 0) return own;
    let out: CellFormat | undefined = own;
    for (const rule of rules) {
      if (!ruleMatches(rule, this.value(rowKey, colId))) continue;
      out = { ...out, ...(rule.fill ? { fill: rule.fill } : {}), ...(rule.color ? { color: rule.color } : {}), ...(rule.b ? { b: true } : {}) };
    }
    return out;
  }
}

export function ruleMatches(rule: SheetRule, value: Scalar): boolean {
  const text = toText(value).trim();
  const target = rule.value.trim();
  switch (rule.op) {
    case "empty":
      return text === "";
    case "notEmpty":
      return text !== "";
    case "eq":
      return text.toLowerCase() === target.toLowerCase();
    case "neq":
      return text.toLowerCase() !== target.toLowerCase();
    case "contains":
      return target !== "" && text.toLowerCase().includes(target.toLowerCase());
    case "notContains":
      return target === "" || !text.toLowerCase().includes(target.toLowerCase());
    default: {
      const a = typeof value === "number" ? value : parseNumber(text);
      const b = parseNumber(target);
      if (a === null || b === null || isError(value)) return false;
      return { gt: a > b, gte: a >= b, lt: a < b, lte: a <= b }[rule.op];
    }
  }
}

export const RULE_LABELS: Record<SheetRule["op"], string> = {
  empty: "비어 있음",
  notEmpty: "비어 있지 않음",
  eq: "값이 같음",
  neq: "값이 다름",
  contains: "포함",
  notContains: "포함하지 않음",
  gt: "보다 큼",
  gte: "이상",
  lt: "보다 작음",
  lte: "이하",
};

/** The operator columns as table columns, so filters, sorting, counting and copy treat them alike. */
export function operatorColumns(doc: SheetDoc, book: () => Workbook): ColumnDef[] {
  return doc.columns.map((column) => {
    const id = OPERATOR_COLUMN + column.id;
    const value = (row: TableRow) => book().value(participantKey(row), id);
    const text = (row: TableRow) => book().display(participantKey(row), id);
    return {
      id,
      label: column.label,
      type: "sheet" as const,
      defaultVisible: true,
      countable: true,
      text,
      buckets: (row: TableRow) => {
        const shown = text(row).trim();
        return shown ? [shown] : [];
      },
      sortValue: (row: TableRow) => {
        const v = value(row);
        if (typeof v === "number") return v;
        const shown = toText(v).trim();
        return shown || null;
      },
      number: (row: TableRow) => {
        const v = value(row);
        return typeof v === "number" ? v : null;
      },
    };
  });
}

/**
 * Where the operator columns go among the shown columns. A column the reader already placed (moved
 * by dragging) stays where it is; any other goes right after the column it was added next to
 * (`after`), or at the end when that column is not shown. `hidden` columns stay out.
 */
export function placeOperatorColumns(shown: readonly string[], doc: SheetDoc, hidden: readonly string[] = []): string[] {
  const known = new Set(doc.columns.map((column) => OPERATOR_COLUMN + column.id));
  const out = shown.filter((id) => !isOperatorColumn(id) || (known.has(id) && !hidden.includes(id)));
  const pending = doc.columns
    .map((column) => ({ id: OPERATOR_COLUMN + column.id, after: column.after }))
    .filter((item) => !out.includes(item.id) && !hidden.includes(item.id));
  let guard = pending.length + 1;
  while (pending.length > 0 && guard-- > 0) {
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      const at = item.after ? out.indexOf(item.after) : -1;
      // Wait for a pending column this one was added next to.
      if (item.after && at < 0 && pending.some((other) => other.id === item.after)) continue;
      if (at >= 0) {
        // After the anchor and after earlier columns added next to the same anchor.
        let place = at + 1;
        while (place < out.length && isOperatorColumn(out[place]) && doc.columns.find((column) => OPERATOR_COLUMN + column.id === out[place])?.after === item.after) place++;
        out.splice(place, 0, item.id);
      } else out.push(item.id);
      pending.splice(i, 1);
      i--;
    }
  }
  return out;
}

/** Parses "B12" for the name box. */
export function parseAddress(text: string): { col: number; row: number } | null {
  const match = /^\s*\$?([A-Za-z]{1,3})\$?([0-9]+)\s*$/.exec(text);
  if (!match) return null;
  return { col: columnIndex(match[1]), row: Number(match[2]) - 1 };
}

/** Tab-separated text (Sheets and Excel clipboard) → rows of cells. Quoted cells may hold tabs and line breaks. */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** Next values for a fill: a run of numbers continues its step, anything else repeats. */
export function fillSeries(source: readonly string[], count: number): string[] {
  const numbers = source.map((text) => (text.startsWith("=") ? null : literal(text)));
  if (source.length >= 2 && numbers.every((n) => typeof n === "number")) {
    const list = numbers as number[];
    const step = list[list.length - 1] - list[list.length - 2];
    return Array.from({ length: count }, (_, i) => formatNumber(list[list.length - 1] + step * (i + 1)));
  }
  return Array.from({ length: count }, (_, i) => source[i % source.length]);
}
