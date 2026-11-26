import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * 참가 현황 operator sheet (#507, #508): operator-only columns, operator rows under the
 * participants, cell values (text or "=formula"), cell formats and conditional format rules. One
 * document per event, shared by the operators; participants never see it.
 *
 * Row keys: `p:<participantId>` for a participant (kept across revisions), `r:<id>` for an operator
 * row. Column keys: `c:<id>` for an operator column, the table's own column id otherwise. A
 * participant row takes a value only in an operator column; an operator row takes one anywhere.
 */
export type CellFormat = {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  u?: boolean;
  color?: string;
  fill?: string;
  align?: "left" | "center" | "right";
};

export type SheetCell = { v?: string; f?: CellFormat };
export type SheetColumn = { id: string; label: string; after: string | null };
export type SheetRuleOp = "empty" | "notEmpty" | "eq" | "neq" | "contains" | "notContains" | "gt" | "gte" | "lt" | "lte";
export type SheetRule = { id: string; col: string; op: SheetRuleOp; value: string; color?: string; fill?: string; b?: boolean };

export type SheetDoc = {
  columns: SheetColumn[];
  rows: { id: string }[];
  cells: Record<string, SheetCell>;
  rules: SheetRule[];
};

export type RosterSheet = {
  doc: SheetDoc;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

export type SheetOp =
  | { op: "addColumn"; id: string; label: string; after: string | null }
  | { op: "updateColumn"; id: string; label: string }
  | { op: "deleteColumn"; id: string }
  | { op: "addRow"; id: string; index?: number | null }
  | { op: "deleteRow"; id: string }
  | { op: "setCell"; row: string; col: string; value?: string | null; format?: CellFormat | null }
  | { op: "setRules"; rules: SheetRule[] };

export const EMPTY_DOC: SheetDoc = { columns: [], rows: [], cells: {}, rules: [] };
export const EMPTY_SHEET: RosterSheet = { doc: EMPTY_DOC, version: 0, updatedAt: null, updatedByDisplayName: null };

export const OPERATOR_COLUMN = "c:";
export const OPERATOR_ROW = "r:";
export const PARTICIPANT_ROW = "p:";

export const cellKey = (row: string, col: string) => `${row}|${col}`;

export function getRosterSheet(eventId: string, signal?: AbortSignal): Promise<RosterSheet> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/roster-sheet`, { signal }).then(parseSheet);
}

/** Applies `ops` in order on the server (needs PARTICIPANT_WRITE). Different cells never conflict. */
export function applyRosterSheetOps(eventId: string, ops: SheetOp[]): Promise<RosterSheet> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/roster-sheet/ops`, {
    method: "POST",
    body: { ops },
  }).then(parseSheet);
}

/** A short random id for a new column or row. */
export function newSheetId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * The server's operations, run locally so an edit shows at once (and by the mock server). Throws
 * on an operation the server would refuse, without changing `doc`.
 */
export function applyOps(doc: SheetDoc, ops: readonly SheetOp[]): SheetDoc {
  const next: SheetDoc = { columns: [...doc.columns], rows: [...doc.rows], cells: { ...doc.cells }, rules: [...doc.rules] };
  for (const op of ops) {
    switch (op.op) {
      case "addColumn":
        if (next.columns.some((column) => column.id === op.id)) throw new Error("duplicate column");
        next.columns.push({ id: op.id, label: op.label.trim(), after: op.after ?? null });
        break;
      case "updateColumn":
        next.columns = next.columns.map((column) => (column.id === op.id ? { ...column, label: op.label.trim() } : column));
        break;
      case "deleteColumn": {
        const key = OPERATOR_COLUMN + op.id;
        next.columns = next.columns
          .filter((column) => column.id !== op.id)
          .map((column) => (column.after === key ? { ...column, after: null } : column));
        for (const cell of Object.keys(next.cells)) if (cell.split("|")[1] === key) delete next.cells[cell];
        next.rules = next.rules.filter((rule) => rule.col !== key);
        break;
      }
      case "addRow": {
        if (next.rows.some((row) => row.id === op.id)) throw new Error("duplicate row");
        const index = op.index ?? next.rows.length;
        next.rows.splice(Math.max(0, Math.min(index, next.rows.length)), 0, { id: op.id });
        break;
      }
      case "deleteRow": {
        next.rows = next.rows.filter((row) => row.id !== op.id);
        const key = OPERATOR_ROW + op.id;
        for (const cell of Object.keys(next.cells)) if (cell.split("|")[0] === key) delete next.cells[cell];
        break;
      }
      case "setCell": {
        const key = cellKey(op.row, op.col);
        const cell: SheetCell = { ...next.cells[key] };
        if ("value" in op) {
          if (op.value) cell.v = op.value;
          else delete cell.v;
        }
        if ("format" in op) {
          const format = cleanFormat(op.format);
          if (format) cell.f = format;
          else delete cell.f;
        }
        if (cell.v === undefined && cell.f === undefined) delete next.cells[key];
        else next.cells[key] = cell;
        break;
      }
      case "setRules":
        next.rules = [...op.rules];
        break;
    }
  }
  return next;
}

/** Drops false flags and empty values; null when nothing is left. */
export function cleanFormat(format: CellFormat | null | undefined): CellFormat | null {
  if (!format) return null;
  const out: CellFormat = {};
  for (const flag of ["b", "i", "s", "u"] as const) if (format[flag]) out[flag] = true;
  if (format.color) out.color = format.color;
  if (format.fill) out.fill = format.fill;
  if (format.align) out.align = format.align;
  return Object.keys(out).length > 0 ? out : null;
}

function parseSheet(value: unknown): RosterSheet {
  if (!isRecord(value) || typeof value.version !== "number" || !isRecord(value.doc)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const doc = value.doc;
  const columns = Array.isArray(doc.columns)
    ? doc.columns.filter(isRecord).flatMap((column) =>
        typeof column.id === "string" && typeof column.label === "string"
          ? [{ id: column.id, label: column.label, after: typeof column.after === "string" ? column.after : null }]
          : [],
      )
    : [];
  const rows = Array.isArray(doc.rows)
    ? doc.rows.filter(isRecord).flatMap((row) => (typeof row.id === "string" ? [{ id: row.id }] : []))
    : [];
  const cells: Record<string, SheetCell> = {};
  if (isRecord(doc.cells)) {
    for (const [key, raw] of Object.entries(doc.cells)) {
      if (!isRecord(raw)) continue;
      const cell: SheetCell = {};
      if (typeof raw.v === "string") cell.v = raw.v;
      const format = isRecord(raw.f) ? cleanFormat(raw.f as CellFormat) : null;
      if (format) cell.f = format;
      if (cell.v !== undefined || cell.f !== undefined) cells[key] = cell;
    }
  }
  const rules = Array.isArray(doc.rules)
    ? doc.rules.filter(isRecord).flatMap((rule) =>
        typeof rule.id === "string" && typeof rule.col === "string" && typeof rule.op === "string"
          ? [
              {
                id: rule.id,
                col: rule.col,
                op: rule.op as SheetRuleOp,
                value: typeof rule.value === "string" ? rule.value : "",
                ...(typeof rule.color === "string" ? { color: rule.color } : {}),
                ...(typeof rule.fill === "string" ? { fill: rule.fill } : {}),
                ...(rule.b === true ? { b: true } : {}),
              },
            ]
          : [],
      )
    : [];
  return {
    doc: { columns, rows, cells, rules },
    version: value.version,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedByDisplayName: typeof value.updatedByDisplayName === "string" ? value.updatedByDisplayName : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
