import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import type { TableRow } from "../../api/applications";
import { cellKey, type CellFormat } from "../../api/rosterSheet";
import { address, columnLetter, FUNCTION_NAMES, shiftFormula } from "./formula";
import {
  editedText,
  isAdded,
  isEdited,
  clampWidth,
  defaultWidth,
  groupRows,
  summarize,
  type ColumnDef,
  type Density,
  type Sort,
} from "./model";
import { fillSeries, isOperatorColumn, parseAddress, parseClipboard, participantKey, type SheetRowRef, type Workbook } from "./sheet";
import type { CellWrite, SheetEditor } from "./useRosterSheet";
import "./SheetGrid.css";

type Cell = { r: number; c: number };
type Range = { top: number; bottom: number; left: number; right: number };

/** One line of the grid body: a group header or a sheet row at flat index `index`. */
type Line = { kind: "group"; key: string; label: string; count: number; open: boolean } | { kind: "row"; ref: SheetRowRef; index: number };

type Editing = { r: number; c: number; text: string; bar: boolean; start: string };
type Menu = { x: number; y: number; kind: "column" | "row" | "cell"; c: number; r: number } | null;

export type Freeze = { cols: number; rows: number };

const PAGE_STEP = 10;
const OVERSCAN = 480;
const GUTTER = 52;
const ROW_H = { comfortable: 44, compact: 32 } as const;
const GROUP_H = 40;

const COLORS = ["#000000", "#5f6368", "#b00020", "#d93025", "#e37400", "#f9ab00", "#188038", "#1a73e8", "#9334e6", "#ffffff"];
const FILLS = ["#fce8e6", "#fef7e0", "#e6f4ea", "#e8f0fe", "#f3e8fd", "#fde7f3", "#f1f3f4", "#fad2cf", "#ceead6", "#d2e3fc"];

/**
 * The sheet of 참가 현황 (#308, #509). A spreadsheet over the applicants: column letters and fixed
 * row numbers, a formula bar, typing into a cell (or Enter, F2, double click) to edit, Tab/Enter to
 * move, paste of a range from Sheets or Excel, the fill handle, Ctrl+Z/Y, formats and conditional
 * formats, frozen rows and columns, and operator rows under the participants. Where a value is saved
 * depends on the cell (see useRosterSheet). Rows outside the visible part are not drawn.
 */
export function SheetGrid({
  eventId,
  columns,
  rows,
  operatorRows,
  book,
  editor,
  summaryRows,
  sorts,
  widths,
  density,
  groupBy,
  freeze,
  toolbarEnd,
  onFreeze,
  onSort,
  onResize,
  onOpen,
  onEdit,
  onHide,
  onMove,
  filtered,
  hiddenColumns,
  onShow,
  onFilter,
  onRules,
}: {
  eventId: string;
  columns: ColumnDef[];
  rows: TableRow[];
  operatorRows: SheetRowRef[];
  book: Workbook;
  editor: SheetEditor;
  summaryRows: TableRow[];
  sorts: Sort[];
  widths: Record<string, number>;
  density: Density;
  groupBy: ColumnDef | null;
  freeze: Freeze;
  toolbarEnd?: ReactNode;
  onFreeze: (freeze: Freeze) => void;
  onSort: (id: string, add: boolean, dir?: "asc" | "desc" | null) => void;
  onResize: (id: string, width: number) => void;
  onOpen: (row: TableRow) => void;
  onEdit?: (row: TableRow) => void;
  onHide: (id: string) => void;
  onMove: (id: string, before: string | null) => void;
  /** Column ids with a filter on; their headers carry a mark. */
  filtered: ReadonlySet<string>;
  /** Columns not shown, offered again by the column menu. */
  hiddenColumns: ColumnDef[];
  onShow: (id: string, after: string) => void;
  /** Opens the filter on that column; `clear` takes it off instead. */
  onFilter: (id: string, clear?: boolean) => void;
  onRules: (colId: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Cell>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [fill, setFill] = useState<Range | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [notice, setNotice] = useState("");
  const [dragWidths, setDragWidths] = useState<Record<string, number>>({});
  const [dragColumn, setDragColumn] = useState<string | null>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const head = useRef<HTMLTableSectionElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(false);
  const clip = useRef<{ text: string; raw: string[][]; origin: Cell } | null>(null);
  const [port, setPort] = useState({ top: 0, height: 0 });
  const [headH, setHeadH] = useState(36);

  const { lines, flat } = useMemo(() => {
    const out: Line[] = [];
    const flatRows: SheetRowRef[] = [];
    const push = (ref: SheetRowRef) => {
      out.push({ kind: "row", ref, index: flatRows.length });
      flatRows.push(ref);
    };
    const refOf = (row: TableRow): SheetRowRef => {
      const key = participantKey(row);
      return { kind: "participant", key, row, number: (book.layout.rowAt.get(key) ?? 0) + 1 };
    };
    if (!groupBy) rows.forEach((row) => push(refOf(row)));
    else {
      for (const group of groupRows(rows, groupBy)) {
        const open = !collapsed.has(group.key);
        out.push({ kind: "group", key: group.key, label: group.label, count: group.rows.length, open });
        if (open) group.rows.forEach((row) => push(refOf(row)));
      }
    }
    operatorRows.forEach(push);
    return { lines: out, flat: flatRows };
  }, [rows, operatorRows, groupBy, collapsed, book]);

  // A range belongs to the rows it was made on: drop it when filters, sorting or grouping change.
  const [rangeRows, setRangeRows] = useState(rows);
  if (rangeRows !== rows) {
    setRangeRows(rows);
    setAnchor(null);
  }

  const rowH = ROW_H[density];
  const frozenRows = groupBy ? 0 : Math.min(freeze.rows, flat.length);
  const frozenCols = Math.min(Math.max(freeze.cols, 0), columns.length);

  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const line of lines) {
      out.push(y);
      y += line.kind === "group" ? GROUP_H : rowH;
    }
    out.push(y);
    return out;
  }, [lines, rowH]);
  const lineOfRow = useMemo(() => {
    const map: number[] = [];
    lines.forEach((line, at) => {
      if (line.kind === "row") map[line.index] = at;
    });
    return map;
  }, [lines]);

  const windowed = port.height > 0;
  let from = frozenRows;
  let to = lines.length;
  if (windowed) {
    const top = port.top - OVERSCAN;
    const bottom = port.top + port.height + OVERSCAN;
    while (from < lines.length && offsets[from + 1] < top) from++;
    to = from;
    while (to < lines.length && offsets[to] < bottom) to++;
  }
  const padTop = offsets[from] - offsets[frozenRows];
  const padBottom = offsets[lines.length] - offsets[to];

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const step = OVERSCAN / 2;
    const read = () => {
      const top = Math.floor(el.scrollTop / step) * step;
      const height = el.clientHeight;
      setPort((before) => (before.top === top && before.height === height ? before : { top, height }));
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", read);
      observer?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const height = head.current?.getBoundingClientRect().height;
    if (height && Math.round(height) !== headH) setHeadH(Math.round(height));
  }, [headH, density, columns.length]);

  const lastRow = flat.length - 1;
  const lastCol = columns.length - 1;
  const cur = { r: Math.min(active.r, Math.max(lastRow, 0)), c: Math.min(active.c, Math.max(lastCol, 0)) };
  const range: Range = anchor
    ? { top: Math.min(anchor.r, cur.r), bottom: Math.max(anchor.r, cur.r), left: Math.min(anchor.c, cur.c), right: Math.max(anchor.c, cur.c) }
    : { top: cur.r, bottom: cur.r, left: cur.c, right: cur.c };
  const multi = range.top !== range.bottom || range.left !== range.right;

  useEffect(() => {
    if (!focusAfterMove.current || editing) return;
    const cell = sheet.current?.querySelector<HTMLElement>(`[data-r="${cur.r}"][data-c="${cur.c}"]`);
    if (!cell) {
      const el = sheet.current;
      const at = lineOfRow[cur.r];
      if (el && at !== undefined) el.scrollTop = Math.max(0, offsets[at] - el.clientHeight / 2);
      return;
    }
    focusAfterMove.current = false;
    cell.focus({ preventScroll: true });
    cell.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".sheet-menu")) setMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const say = useCallback((text: string) => {
    setNotice(text);
    editor.setNotice("");
  }, [editor]);

  function move(next: Cell, extend: boolean) {
    const target = { r: Math.max(0, Math.min(lastRow, next.r)), c: Math.max(0, Math.min(lastCol, next.c)) };
    if (extend) setAnchor((before) => before ?? cur);
    else setAnchor(null);
    setActive(target);
    focusAfterMove.current = true;
  }

  const refAt = (r: number) => flat[r];
  const keyOf = (r: number, c: number) => ({ rowKey: flat[r].key, colId: columns[c].id });
  const lockOf = (r: number, c: number) => editor.lockReason(flat[r].key, columns[c]);

  /** What the editor starts with: the formula or plain text, the name alone in the person cell. */
  function rawOf(r: number, c: number): string {
    const ref = flat[r];
    const column = columns[c];
    const pending = editor.overlay.get(cellKey(ref.key, column.id));
    if (pending !== undefined) return pending;
    if (column.id === "person" && ref.kind === "participant") return column.text(ref.row).replace(/^\d{2}\s+/, "");
    return book.raw(ref.key, column.id);
  }

  function startEdit(r: number, c: number, text?: string, bar = false) {
    if (flat.length === 0) return;
    const reason = lockOf(r, c);
    if (reason) {
      say(reason);
      return false;
    }
    const start = rawOf(r, c);
    setEditing({ r, c, text: text ?? start, bar, start });
    return true;
  }

  function commitEdit(next?: Cell) {
    if (!editing) return;
    const { r, c, text } = editing;
    setEditing(null);
    const before = rawOf(r, c);
    if (text !== before) editor.commit([{ ...keyOf(r, c), text }], book);
    if (next) move(next, false);
    else focusAfterMove.current = true;
  }

  function cancelEdit() {
    setEditing(null);
    focusAfterMove.current = true;
  }

  function rangeCells(area: Range = range): { rowKey: string; colId: string; r: number; c: number }[] {
    const out = [];
    for (let r = area.top; r <= area.bottom; r++) for (let c = area.left; c <= area.right; c++) out.push({ ...keyOf(r, c), r, c });
    return out;
  }

  function displayOf(r: number, c: number): string {
    const ref = flat[r];
    const column = columns[c];
    const pending = editor.overlay.get(cellKey(ref.key, column.id));
    if (pending !== undefined) return pending;
    if (ref.kind === "operator" || isOperatorColumn(column.id)) return book.display(ref.key, column.id);
    return column.text(ref.row);
  }

  async function copy(cut = false) {
    const lines: string[] = [];
    const raw: string[][] = [];
    for (let r = range.top; r <= range.bottom; r++) {
      const shown: string[] = [];
      const typed: string[] = [];
      for (let c = range.left; c <= range.right; c++) {
        shown.push(displayOf(r, c).replace(/[\t\r\n]+/g, " "));
        typed.push(rawOf(r, c));
      }
      lines.push(shown.join("\t"));
      raw.push(typed);
    }
    const text = lines.join("\n");
    clip.current = { text, raw, origin: { r: range.top, c: range.left } };
    try {
      await navigator.clipboard.writeText(text);
      const size = `${range.bottom - range.top + 1}행 ${range.right - range.left + 1}열`;
      say(cut ? `${size}을 잘라냈어요.` : `${size}을 복사했어요.`);
    } catch {
      say("복사하지 못했어요. 브라우저가 클립보드를 막았을 수 있어요.");
    }
    if (cut) clearValues();
  }

  function clearValues() {
    const writes: CellWrite[] = [];
    let skipped = false;
    for (const cell of rangeCells()) {
      const held = flat[cell.r].kind === "operator" || isOperatorColumn(cell.colId) || cell.colId === "operationMemo";
      if (!held) {
        if (!lockOf(cell.r, cell.c)) skipped = true;
        continue;
      }
      if (lockOf(cell.r, cell.c)) continue;
      writes.push({ rowKey: cell.rowKey, colId: cell.colId, text: "" });
    }
    if (writes.length > 0) editor.commit(writes, book);
    if (skipped) say("참가자 답은 지우지 않았어요. 고치려면 칸에 새 값을 적어 주세요.");
  }

  function paste(text: string) {
    let grid = parseClipboard(text);
    // Our own copy keeps formulas, moved to where they land.
    if (clip.current && clip.current.text === text) {
      const { raw, origin } = clip.current;
      grid = raw.map((line, dr) =>
        line.map((value, dc) => {
          if (!value.startsWith("=")) return value;
          const from = { r: origin.r + dr, c: origin.c + dc };
          return shiftFormula(value, cur.c + dc - from.c, rowNumber(cur.r + dr) - rowNumber(from.r));
        }),
      );
    }
    const single = grid.length === 1 && grid[0].length === 1;
    const area = single && multi ? range : { top: cur.r, left: cur.c, bottom: cur.r + grid.length - 1, right: cur.c + Math.max(...grid.map((line) => line.length)) - 1 };
    const writes: CellWrite[] = [];
    let clipped = false;
    for (let r = area.top; r <= area.bottom; r++) {
      for (let c = area.left; c <= area.right; c++) {
        if (r > lastRow || c > lastCol) {
          clipped = true;
          continue;
        }
        const value = single ? grid[0][0] : grid[r - area.top]?.[c - area.left];
        if (value === undefined || lockOf(r, c)) continue;
        writes.push({ ...keyOf(r, c), text: value });
      }
    }
    if (writes.length > 0) editor.commit(writes, book);
    setAnchor(single && multi ? anchor : { r: area.top, c: area.left });
    setActive({ r: Math.min(area.bottom, lastRow), c: Math.min(area.right, lastCol) });
    if (clipped) say("표 밖으로 넘친 칸은 붙이지 않았어요. 아래에 행을 더한 뒤 다시 붙여 주세요.");
  }

  /** Fixed row number (0-based) of a drawn row, for moving formulas. */
  function rowNumber(r: number): number {
    const ref = flat[Math.min(r, lastRow)];
    return ref ? ref.number - 1 + Math.max(0, r - lastRow) : r;
  }

  function fillTo(source: Range, target: Range) {
    const writes: CellWrite[] = [];
    const down = target.bottom > source.bottom || target.top < source.top;
    if (down) {
      const upward = target.top < source.top;
      for (let c = source.left; c <= source.right; c++) {
        const values = [];
        for (let r = source.top; r <= source.bottom; r++) values.push(rawOf(r, c));
        const targets = upward ? range_(target.top, source.top - 1).reverse() : range_(source.bottom + 1, target.bottom);
        const series = fillSeries(upward ? [...values].reverse() : values, targets.length);
        targets.forEach((r, i) => {
          if (lockOf(r, c)) return;
          const fromR = upward ? source.bottom - (i % values.length) : source.top + (i % values.length);
          const value = series[i].startsWith("=") ? shiftFormula(rawOf(fromR, c), 0, rowNumber(r) - rowNumber(fromR)) : series[i];
          writes.push({ ...keyOf(r, c), text: value });
        });
      }
    } else {
      const leftward = target.left < source.left;
      for (let r = source.top; r <= source.bottom; r++) {
        const values = [];
        for (let c = source.left; c <= source.right; c++) values.push(rawOf(r, c));
        const targets = leftward ? range_(target.left, source.left - 1).reverse() : range_(source.right + 1, target.right);
        const series = fillSeries(leftward ? [...values].reverse() : values, targets.length);
        targets.forEach((c, i) => {
          if (lockOf(r, c)) return;
          const fromC = leftward ? source.right - (i % values.length) : source.left + (i % values.length);
          const value = series[i].startsWith("=") ? shiftFormula(rawOf(r, fromC), c - fromC, 0) : series[i];
          writes.push({ ...keyOf(r, c), text: value });
        });
      }
    }
    if (writes.length > 0) editor.commit(writes, book);
    setAnchor({ r: target.top, c: target.left });
    setActive({ r: target.bottom, c: target.right });
  }

  function formatRange(patch: CellFormat | null) {
    if (!editor.mayWrite) {
      say("서식을 바꿀 권한이 없어요.");
      return;
    }
    editor.formatCells(rangeCells(), patch);
  }

  const activeFormat = flat.length > 0 && columns.length > 0 ? book.format(flat[cur.r].key, columns[cur.c].id) : undefined;
  function toggle(flag: "b" | "i" | "s" | "u") {
    formatRange({ [flag]: !activeFormat?.[flag] });
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (flat.length === 0 || columns.length === 0) return;
    // Keys belong to the cells; the toolbar, the formula bar, headers and the editor handle their own.
    const target = event.target as HTMLElement;
    if (!target.closest("tbody") || target.closest(".sheet-editor, .sheet-menu")) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const extend = event.shiftKey;
    const key = event.key;
    const keys: Record<string, () => void> = {
      ArrowUp: () => move({ r: ctrl ? 0 : cur.r - 1, c: cur.c }, extend),
      ArrowDown: () => move({ r: ctrl ? lastRow : cur.r + 1, c: cur.c }, extend),
      ArrowLeft: () => move({ r: cur.r, c: ctrl ? 0 : cur.c - 1 }, extend),
      ArrowRight: () => move({ r: cur.r, c: ctrl ? lastCol : cur.c + 1 }, extend),
      PageUp: () => move({ r: cur.r - PAGE_STEP, c: cur.c }, extend),
      PageDown: () => move({ r: cur.r + PAGE_STEP, c: cur.c }, extend),
      Home: () => move({ r: ctrl ? 0 : cur.r, c: 0 }, extend),
      End: () => move({ r: ctrl ? lastRow : cur.r, c: lastCol }, extend),
      Tab: () => move({ r: cur.r, c: cur.c + (extend ? -1 : 1) }, false),
    };
    if (keys[key]) {
      event.preventDefault();
      keys[key]();
      return;
    }
    if (ctrl) {
      const lower = key.toLowerCase();
      const actions: Record<string, () => void> = {
        c: () => void copy(),
        x: () => void copy(true),
        a: () => {
          setAnchor({ r: 0, c: 0 });
          setActive({ r: lastRow, c: lastCol });
        },
        z: () => (event.shiftKey ? editor.redo(book) : editor.undo(book)),
        y: () => editor.redo(book),
        b: () => toggle("b"),
        i: () => toggle("i"),
        u: () => toggle("u"),
        d: () => range.bottom > range.top && fillTo({ ...range, bottom: range.top }, range),
        r: () => range.right > range.left && fillTo({ ...range, right: range.left }, range),
      };
      if (actions[lower]) {
        event.preventDefault();
        actions[lower]();
      }
      return;
    }
    if (key === "Enter" || key === "F2") {
      if ((event.target as HTMLElement).closest("a,button")) return;
      event.preventDefault();
      if (lockOf(cur.r, cur.c)) {
        const ref = refAt(cur.r);
        if (key === "Enter" && ref.kind === "participant") onOpen(ref.row);
        else say(lockOf(cur.r, cur.c)!);
        return;
      }
      startEdit(cur.r, cur.c);
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      clearValues();
      return;
    }
    if (key === "Escape") {
      setAnchor(null);
      return;
    }
    // E opens the 운영 정보 drawer for the active row (#337) when the cell cannot take text.
    const ref = refAt(cur.r);
    if (onEdit && key.toLowerCase() === "e" && ref.kind === "participant" && lockOf(cur.r, cur.c)) {
      event.preventDefault();
      onEdit(ref.row);
      return;
    }
    // Typing starts editing with the typed character, as in Sheets.
    if (key.length === 1 && !event.altKey) {
      if (lockOf(cur.r, cur.c)) {
        say(lockOf(cur.r, cur.c)!);
        return;
      }
      event.preventDefault();
      startEdit(cur.r, cur.c, key);
    }
  }

  function onPaste(event: ReactClipboardEvent<HTMLElement>) {
    if (editing || !(event.target as HTMLElement).closest("tbody")) return;
    event.preventDefault();
    paste(event.clipboardData.getData("text/plain"));
  }

  function width(column: ColumnDef): number {
    return dragWidths[column.id] ?? widths[column.id] ?? defaultWidth(column);
  }

  function startResize(column: ColumnDef, event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width(column);
    let latest = startWidth;
    const onMoveEvent = (moveEvent: PointerEvent) => {
      latest = clampWidth(startWidth + moveEvent.clientX - startX);
      setDragWidths((before) => ({ ...before, [column.id]: latest }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      setDragWidths((before) => {
        const next = { ...before };
        delete next[column.id];
        return next;
      });
      if (latest !== startWidth) onResize(column.id, latest);
    };
    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
  }

  function startFill(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const source = range;
    let target: Range = source;
    const onMoveEvent = (moveEvent: PointerEvent) => {
      const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>("[data-r]");
      if (!el) return;
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      const dRow = r > source.bottom ? r - source.bottom : r < source.top ? r - source.top : 0;
      const dCol = c > source.right ? c - source.right : c < source.left ? c - source.left : 0;
      if (Math.abs(dRow) >= Math.abs(dCol)) target = { ...source, top: Math.min(source.top, r), bottom: Math.max(source.bottom, r) };
      else target = { ...source, left: Math.min(source.left, c), right: Math.max(source.right, c) };
      setFill(target);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      setFill(null);
      if (target !== source) fillTo(source, target);
    };
    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
  }

  // Stable handlers so a memoized row re-renders only when its own cells change.
  type Handlers = { pick: (r: number, c: number, extend: boolean, event: ReactMouseEvent) => void; open: (r: number, c: number) => void };
  const handlers = useRef<Handlers>({ pick: () => {}, open: () => {} });
  useLayoutEffect(() => {
    handlers.current.pick = (r, c, extend, event) => {
      // While a formula is typed, a click puts the cell's address in it.
      if (editing && editing.text.startsWith("=") && (editing.r !== r || editing.c !== c)) {
        event.preventDefault();
        setEditing({ ...editing, text: editing.text + address(c, rowNumber(r)) });
        return;
      }
      if (editing) commitEdit();
      setMenu(null);
      if (extend) setAnchor((before) => before ?? cur);
      else setAnchor(null);
      setActive({ r, c });
    };
    handlers.current.open = (r, c) => {
      if (!lockOf(r, c)) {
        startEdit(r, c);
        return;
      }
      const ref = refAt(r);
      if (ref.kind === "participant") onOpen(ref.row);
    };
  });
  const pick = useCallback((r: number, c: number, extend: boolean, event: ReactMouseEvent) => handlers.current.pick(r, c, extend, event), []);
  const open = useCallback((r: number, c: number) => handlers.current.open(r, c), []);
  const menuAt = useCallback((kind: "row" | "cell", r: number, c: number, event: ReactMouseEvent) => {
    event.preventDefault();
    setMenu({ kind, r, c, x: event.clientX, y: event.clientY });
  }, []);

  // Frozen columns stay put at these offsets from the row numbers.
  const lefts: number[] = [];
  {
    let x = GUTTER;
    columns.forEach((column, c) => {
      lefts.push(x);
      if (c < frozenCols) x += width(column);
    });
  }
  const frozenStyle = (c: number) => (c < frozenCols ? { left: lefts[c] } : undefined);

  const total = GUTTER + columns.reduce((sum, column) => sum + width(column), 0);
  const activeRef = flat[cur.r];
  const activeColumn = columns[cur.c];
  const barText = editing ? editing.text : flat.length > 0 && activeColumn ? rawOf(cur.r, cur.c) : "";
  const barLocked = flat.length === 0 || !activeColumn ? "칸을 골라 주세요." : lockOf(cur.r, cur.c);
  const shownNotice = editor.notice || notice;

  const fillArea = fill ?? null;

  function renderRow(line: Extract<Line, { kind: "row" }>, frozenAt: number | null) {
    const { ref, index } = line;
    const inRange = index >= range.top && index <= range.bottom;
    return (
      <SheetLine
        key={`${index}:${ref.key}`}
        refRow={ref}
        index={index}
        columns={columns}
        eventId={eventId}
        book={book}
        overlay={editor.overlay}
        lefts={lefts}
        frozenCols={frozenCols}
        stickyTop={frozenAt === null ? null : headH + frozenAt * rowH}
        activeC={cur.r === index ? cur.c : -1}
        selLeft={(multi || fillArea) && inRange ? range.left : -1}
        selRight={(multi || fillArea) && inRange ? range.right : -1}
        fillCols={fillArea && index >= fillArea.top && index <= fillArea.bottom ? [fillArea.left, fillArea.right] : null}
        handleC={!editing && editor.mayWrite && index === range.bottom ? range.right : -1}
        editing={editing && editing.r === index && !editing.bar ? editing : null}
        choices={editing && editing.r === index ? editor.choicesFor(columns[editing.c]) : null}
        onPick={pick}
        onOpen={open}
        onMenu={menuAt}
        onFillStart={startFill}
        onEditChange={(text) => setEditing((before) => (before ? { ...before, text } : before))}
        onEditKey={(event) => {
          if (event.key === "Enter" && !event.altKey) {
            event.preventDefault();
            commitEdit({ r: cur.r + (event.shiftKey ? -1 : 1), c: cur.c });
          } else if (event.key === "Tab") {
            event.preventDefault();
            commitEdit({ r: cur.r, c: cur.c + (event.shiftKey ? -1 : 1) });
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelEdit();
          }
        }}
        onEditBlur={() => {
          // A click on another cell commits through pick; a click elsewhere commits here.
          setTimeout(() => {
            if (!sheet.current?.contains(document.activeElement)) commitEdit();
          }, 0);
        }}
        onChoose={(text) => {
          setEditing(null);
          editor.commit([{ ...keyOf(index, cur.c), text }], book);
          move({ r: index + 1, c: cur.c }, false);
        }}
      />
    );
  }

  const frozenLines = lines.slice(0, frozenRows).filter((line): line is Extract<Line, { kind: "row" }> => line.kind === "row");

  return (
    <div className="sheet" onKeyDown={onKeyDown} onPaste={onPaste}>
      <div className="sheet-toolbar" role="toolbar" aria-label="편집 도구">
        <ToolButton label="실행 취소 (Ctrl+Z)" disabled={!editor.canUndo} onClick={() => editor.undo(book)}>
          ↶
        </ToolButton>
        <ToolButton label="다시 실행 (Ctrl+Y)" disabled={!editor.canRedo} onClick={() => editor.redo(book)}>
          ↷
        </ToolButton>
        <span className="sheet-toolbar__sep" aria-hidden="true" />
        <ToolButton label="굵게 (Ctrl+B)" pressed={!!activeFormat?.b} onClick={() => toggle("b")}>
          <b>B</b>
        </ToolButton>
        <ToolButton label="기울임 (Ctrl+I)" pressed={!!activeFormat?.i} onClick={() => toggle("i")}>
          <i>I</i>
        </ToolButton>
        <ToolButton label="밑줄 (Ctrl+U)" pressed={!!activeFormat?.u} onClick={() => toggle("u")}>
          <u>U</u>
        </ToolButton>
        <ToolButton label="취소선" pressed={!!activeFormat?.s} onClick={() => toggle("s")}>
          <s>S</s>
        </ToolButton>
        <Palette label="글자 색" icon="A" colors={COLORS} current={activeFormat?.color} onPick={(color) => formatRange({ color: color ?? undefined })} />
        <Palette label="채우기 색" icon="▧" colors={FILLS} current={activeFormat?.fill} onPick={(fill) => formatRange({ fill: fill ?? undefined })} />
        <span className="sheet-toolbar__sep" aria-hidden="true" />
        {(["left", "center", "right"] as const).map((align) => (
          <ToolButton
            key={align}
            label={{ left: "왼쪽 맞춤", center: "가운데 맞춤", right: "오른쪽 맞춤" }[align]}
            pressed={activeFormat?.align === align}
            onClick={() => formatRange({ align: activeFormat?.align === align ? undefined : align })}
          >
            {{ left: "⇤", center: "↔", right: "⇥" }[align]}
          </ToolButton>
        ))}
        <ToolButton label="서식 지우기" onClick={() => formatRange(null)}>
          ⌫
        </ToolButton>
        <span className="sheet-toolbar__sep" aria-hidden="true" />
        <button type="button" className="sheet-toolbar__text" onClick={() => onRules(activeColumn?.id ?? null)}>
          조건부 서식
        </button>
        <FreezeMenu freeze={{ cols: frozenCols, rows: frozenRows }} activeC={cur.c} activeR={cur.r} grouped={!!groupBy} onFreeze={onFreeze} />
        {editor.mayWrite ? (
          <>
            <button type="button" className="sheet-toolbar__text" onClick={() => editor.addColumn(columns[columns.length - 1]?.id ?? null)}>
              + 열
            </button>
            <button type="button" className="sheet-toolbar__text" onClick={() => editor.addRows(1)}>
              + 행
            </button>
          </>
        ) : null}
        <span className="sheet-toolbar__status" aria-live="polite">
          {editor.saving ? "저장 중…" : ""}
        </span>
        {toolbarEnd}
      </div>

      <div className="sheet-bar">
        <input
          className="sheet-bar__name"
          aria-label="칸 주소"
          key={`${cur.r}:${cur.c}:${multi}`}
          defaultValue={
            activeColumn && activeRef
              ? multi
                ? `${address(range.left, rowNumber(range.top))}:${address(range.right, rowNumber(range.bottom))}`
                : address(cur.c, rowNumber(cur.r))
              : ""
          }
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const target = parseAddress(event.currentTarget.value);
            if (!target) return;
            const r = flat.findIndex((ref) => ref.number - 1 === target.row);
            if (r < 0 || target.col > lastCol) {
              say("그 칸은 지금 보이지 않아요. 필터나 숨긴 열을 확인해 주세요.");
              return;
            }
            move({ r, c: target.col }, false);
          }}
        />
        <span className="sheet-bar__fx" aria-hidden="true">
          fx
        </span>
        <input
          className="sheet-bar__input"
          aria-label="수식 입력줄"
          value={barText}
          readOnly={!!barLocked}
          title={barLocked ?? undefined}
          onFocus={() => {
            if (!barLocked && !editing) setEditing({ r: cur.r, c: cur.c, text: rawOf(cur.r, cur.c), bar: true, start: rawOf(cur.r, cur.c) });
          }}
          onChange={(event) => setEditing((before) => (before ? { ...before, text: event.target.value } : before))}
          onKeyDown={(event) => {
            if (!editing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              commitEdit({ r: cur.r + 1, c: cur.c });
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelEdit();
            } else if (event.key === "Tab") {
              event.preventDefault();
              commitEdit({ r: cur.r, c: cur.c + 1 });
            }
          }}
          onBlur={() => editing?.bar && commitEdit()}
        />
      </div>

      <div ref={sheet} className={`roster__sheet roster__sheet--${density} sheet-scroll`}>
        <table
          className={`roster__table roster__table--${density} sheet-table`}
          role="grid"
          aria-label="신청자 명단"
          aria-rowcount={flat.length + 2}
          aria-colcount={columns.length + 1}
          aria-multiselectable="true"
          style={{ width: total }}
        >
          <colgroup>
            <col style={{ width: GUTTER }} />
            {columns.map((column) => (
              <col key={column.id} style={{ width: width(column) }} />
            ))}
          </colgroup>
          <thead ref={head}>
            <tr aria-rowindex={1}>
              <td
                className="sheet-corner"
                aria-label="전체 선택"
                onMouseDown={() => {
                  setAnchor({ r: 0, c: 0 });
                  setActive({ r: lastRow, c: lastCol });
                }}
              />
              {columns.map((column, c) => (
                <HeaderCell
                  key={column.id}
                  column={column}
                  index={c}
                  letter={columnLetter(c)}
                  sorts={sorts}
                  filtered={filtered.has(column.id)}
                  width={width(column)}
                  frozen={c < frozenCols}
                  left={lefts[c]}
                  selected={c >= range.left && c <= range.right && range.top === 0 && range.bottom === lastRow}
                  dragging={dragColumn === column.id}
                  onSort={(add) => onSort(column.id, add)}
                  onSelect={(extend) => {
                    if (extend) setAnchor((before) => before ?? { r: 0, c: cur.c });
                    else setAnchor({ r: 0, c });
                    setActive({ r: lastRow, c });
                  }}
                  onMenu={(event) => {
                    event.preventDefault();
                    setMenu({ kind: "column", c, r: cur.r, x: event.clientX, y: event.clientY });
                  }}
                  onResizeStart={(event) => startResize(column, event)}
                  onResizeKey={(delta) => onResize(column.id, clampWidth(width(column) + delta))}
                  onDragStart={() => setDragColumn(column.id)}
                  onDragEnd={() => setDragColumn(null)}
                  onDrop={() => {
                    if (dragColumn && dragColumn !== column.id && column.id !== "person") onMove(dragColumn, column.id);
                    setDragColumn(null);
                  }}
                />
              ))}
            </tr>
          </thead>
          <tbody ref={body}>
            {frozenLines.map((line, at) => renderRow(line, at))}
            {padTop > 0 ? (
              <tr aria-hidden="true" className="roster__pad" style={{ height: padTop }}>
                <td colSpan={columns.length + 1} />
              </tr>
            ) : null}
            {lines.slice(from, to).map((line) =>
              line.kind === "group" ? (
                <tr key={`g:${line.key}`} className="roster__group-row">
                  <th scope="rowgroup" colSpan={columns.length + 1}>
                    <button
                      type="button"
                      aria-expanded={line.open}
                      onClick={() =>
                        setCollapsed((before) => {
                          const next = new Set(before);
                          if (next.has(line.key)) next.delete(line.key);
                          else next.add(line.key);
                          return next;
                        })
                      }
                    >
                      <span aria-hidden="true">{line.open ? "▾" : "▸"}</span> {groupBy?.label}: {line.label}
                      <span className="roster__group-count">{line.count}명</span>
                    </button>
                  </th>
                </tr>
              ) : (
                renderRow(line, null)
              ),
            )}
            {padBottom > 0 ? (
              <tr aria-hidden="true" className="roster__pad" style={{ height: padBottom }}>
                <td colSpan={columns.length + 1} />
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="roster__totals" aria-rowindex={flat.length + 2}>
              <td className="sheet-gutter roster__sticky" />
              {columns.map((column, c) => (
                <td
                  key={column.id}
                  className={c < frozenCols ? "roster__sticky" : undefined}
                  style={frozenStyle(c)}
                  title={summarize(summaryRows, column)}
                >
                  {summarize(summaryRows, column)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && operatorRows.length === 0 ? <p className="roster__empty">조건에 맞는 신청자가 없어요.</p> : null}
        {editor.mayWrite ? <AddRows onAdd={(count) => editor.addRows(count)} /> : null}
      </div>

      {menu ? (
        <SheetMenu
          menu={menu}
          column={columns[menu.c]}
          rowRef={flat[menu.r]}
          editor={editor}
          frozenCols={frozenCols}
          frozenRows={frozenRows}
          selectedOperatorRows={flat
            .slice(range.top, range.bottom + 1)
            .filter((ref): ref is Extract<SheetRowRef, { kind: "operator" }> => ref.kind === "operator")
            .map((ref) => ref.id)}
          onClose={() => setMenu(null)}
          sorted={sorts.some((sort) => sort.id === columns[menu.c]?.id)}
          filtered={filtered.has(columns[menu.c]?.id ?? "")}
          hiddenColumns={hiddenColumns}
          onSort={(dir) => onSort(columns[menu.c].id, false, dir)}
          onHide={() => onHide(columns[menu.c].id)}
          onShow={(id) => onShow(id, columns[menu.c].id)}
          onFilter={(clear) => onFilter(columns[menu.c].id, clear)}
          onRules={() => onRules(columns[menu.c].id)}
          onFreeze={onFreeze}
          onOpen={() => {
            const ref = flat[menu.r];
            if (ref?.kind === "participant") onOpen(ref.row);
          }}
          onEditRow={
            onEdit
              ? () => {
                  const ref = flat[menu.r];
                  if (ref?.kind === "participant") onEdit(ref.row);
                }
              : undefined
          }
          onCopy={() => void copy()}
          onCut={() => void copy(true)}
          onClear={clearValues}
          onClearFormat={() => formatRange(null)}
          operatorIndex={(id) => operatorRows.findIndex((ref) => ref.kind === "operator" && ref.id === id)}
        />
      ) : null}

      <p className="roster__hint roster__live" aria-live="polite">
        {shownNotice}
      </p>
    </div>
  );
}

function range_(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="sheet-toolbar__button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Palette({
  label,
  icon,
  colors,
  current,
  onPick,
}: {
  label: string;
  icon: string;
  colors: string[];
  current?: string;
  onPick: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="sheet-palette">
      <button
        type="button"
        className="sheet-toolbar__button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <span className="sheet-palette__icon" style={{ borderBottomColor: current ?? "transparent" }}>
          {icon}
        </span>
      </button>
      {open ? (
        <span className="sheet-palette__menu" role="group" aria-label={label}>
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className="sheet-palette__swatch"
              style={{ background: color }}
              aria-label={color}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(color);
                setOpen(false);
              }}
            />
          ))}
          <button
            type="button"
            className="sheet-palette__none"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
          >
            없음
          </button>
        </span>
      ) : null}
    </span>
  );
}

function FreezeMenu({
  freeze,
  activeC,
  activeR,
  grouped,
  onFreeze,
}: {
  freeze: Freeze;
  activeC: number;
  activeR: number;
  grouped: boolean;
  onFreeze: (freeze: Freeze) => void;
}) {
  const [open, setOpen] = useState(false);
  const item = (label: string, next: Freeze, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onFreeze(next);
        setOpen(false);
      }}
    >
      {label}
    </button>
  );
  return (
    <span className="sheet-palette">
      <button type="button" className="sheet-toolbar__text" aria-expanded={open} onClick={() => setOpen(!open)}>
        틀 고정
      </button>
      {open ? (
        <span className="sheet-menu sheet-menu--inline" role="menu" aria-label="틀 고정">
          {item("열 고정 없음", { ...freeze, cols: 0 })}
          {item("열 1개", { ...freeze, cols: 1 })}
          {item("열 2개", { ...freeze, cols: 2 })}
          {item(`현재 열(${columnLetter(activeC)})까지`, { ...freeze, cols: activeC + 1 })}
          <hr />
          {item("행 고정 없음", { ...freeze, rows: 0 })}
          {item("행 1개", { ...freeze, rows: 1 }, grouped)}
          {item("행 2개", { ...freeze, rows: 2 }, grouped)}
          {item("현재 행까지", { ...freeze, rows: activeR + 1 }, grouped)}
        </span>
      ) : null}
    </span>
  );
}

function AddRows({ onAdd }: { onAdd: (count: number) => void }) {
  const [count, setCount] = useState("1");
  return (
    <div className="sheet-addrows">
      <button type="button" className="sheet-toolbar__text" onClick={() => onAdd(Math.max(1, Math.min(500, Number(count) || 1)))}>
        추가
      </button>
      <input aria-label="더할 행 수" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value.replace(/\D/g, ""))} />
      <span>개 행을 맨 아래에 (운영 줄)</span>
    </div>
  );
}

function SheetMenu({
  menu,
  column,
  rowRef,
  editor,
  frozenCols,
  frozenRows,
  selectedOperatorRows,
  sorted,
  filtered,
  hiddenColumns,
  onClose,
  onSort,
  onHide,
  onShow,
  onFilter,
  onRules,
  onFreeze,
  onOpen,
  onEditRow,
  onCopy,
  onCut,
  onClear,
  onClearFormat,
  operatorIndex,
}: {
  menu: NonNullable<Menu>;
  column: ColumnDef | undefined;
  rowRef: SheetRowRef | undefined;
  editor: SheetEditor;
  frozenCols: number;
  frozenRows: number;
  selectedOperatorRows: string[];
  sorted: boolean;
  filtered: boolean;
  hiddenColumns: ColumnDef[];
  onClose: () => void;
  onSort: (dir: "asc" | "desc" | null) => void;
  onHide: () => void;
  onShow: (id: string) => void;
  onFilter: (clear?: boolean) => void;
  onRules: () => void;
  onFreeze: (freeze: Freeze) => void;
  onOpen: () => void;
  onEditRow?: () => void;
  onCopy: () => void;
  onCut: () => void;
  onClear: () => void;
  onClearFormat: () => void;
  operatorIndex: (id: string) => number;
}) {
  const [renaming, setRenaming] = useState(false);
  const [showing, setShowing] = useState(false);
  const [label, setLabel] = useState(column?.label ?? "");
  if (!column) return null;
  const operator = isOperatorColumn(column.id);
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const item = (text: string, fn: () => void, disabled = false) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={act(fn)}>
      {text}
    </button>
  );
  const style = { left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 360) };
  const may = editor.mayWrite;
  return (
    <div className="sheet-menu" role="menu" aria-label="칸 메뉴" style={style} onKeyDown={(event) => event.key === "Escape" && onClose()}>
      {menu.kind === "column" ? (
        <>
          {renaming ? (
            <form
              className="sheet-menu__rename"
              onSubmit={(event) => {
                event.preventDefault();
                editor.renameColumn(column.id, label);
                onClose();
              }}
            >
              <input aria-label="열 이름" autoFocus value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} />
              <button type="submit">저장</button>
            </form>
          ) : null}
          {operator && may ? (
            <button type="button" role="menuitem" onClick={() => setRenaming(true)}>
              열 이름 바꾸기
            </button>
          ) : null}
          {may && column.id !== "person" ? item("왼쪽에 열 삽입", () => editor.addColumn(leftOf(column.id))) : null}
          {may ? item("오른쪽에 열 삽입", () => editor.addColumn(column.id)) : null}
          <hr />
          {item("오름차순 정렬 (가→하)", () => onSort("asc"))}
          {item("내림차순 정렬 (하→가)", () => onSort("desc"))}
          {sorted ? item("정렬 해제", () => onSort(null)) : null}
          {item("필터", () => onFilter())}
          {filtered ? item("필터 해제", () => onFilter(true)) : null}
          {item("조건부 서식", onRules)}
          <hr />
          {item(frozenCols === menu.c + 1 ? "열 고정 해제" : `${columnLetter(menu.c)}열까지 고정`, () =>
            onFreeze({ cols: frozenCols === menu.c + 1 ? 0 : menu.c + 1, rows: frozenRows }),
          )}
          {column.id !== "person" ? item("열 숨기기", onHide) : null}
          {hiddenColumns.length > 0 ? (
            <button type="button" role="menuitem" aria-expanded={showing} onClick={() => setShowing(!showing)}>
              숨긴 열 보이기 ({hiddenColumns.length})
            </button>
          ) : null}
          {showing ? (
            <span className="sheet-menu sheet-menu--inline" role="group" aria-label="숨긴 열">
              {hiddenColumns.map((hidden) => (
                <button key={hidden.id} type="button" role="menuitem" onClick={act(() => onShow(hidden.id))}>
                  {hidden.label}
                </button>
              ))}
            </span>
          ) : null}
          {operator && may
            ? item("열 삭제", () => {
                if (window.confirm(`"${column.label}" 열과 그 안의 값을 지울까요? Ctrl+Z로 되돌릴 수 있어요.`)) editor.deleteColumn(column.id);
              })
            : null}
        </>
      ) : (
        <>
          {item("잘라내기 (Ctrl+X)", onCut, !may)}
          {item("복사 (Ctrl+C)", onCopy)}
          <span className="sheet-menu__note">붙여넣기는 Ctrl(⌘)+V</span>
          {item("값 지우기", onClear, !may)}
          {item("서식 지우기", onClearFormat, !may)}
          <hr />
          {rowRef?.kind === "participant" ? (
            <>
              {item("신청 상세 보기", onOpen)}
              {onEditRow ? item("운영 정보 수정 (E)", onEditRow) : null}
              {may ? item("맨 아래에 운영 줄 추가", () => editor.addRows(1)) : null}
            </>
          ) : rowRef?.kind === "operator" && may ? (
            <>
              {item("위에 행 삽입", () => editor.addRows(1, operatorIndex(rowRef.id)))}
              {item("아래에 행 삽입", () => editor.addRows(1, operatorIndex(rowRef.id) + 1))}
              {item(selectedOperatorRows.length > 1 ? `행 ${selectedOperatorRows.length}개 삭제` : "행 삭제", () =>
                editor.deleteRows(selectedOperatorRows.length > 0 ? selectedOperatorRows : [rowRef.id]),
              )}
            </>
          ) : null}
          <hr />
          {item(frozenRows === menu.r + 1 ? "행 고정 해제" : `${rowRef?.number ?? menu.r + 1}행까지 고정`, () =>
            onFreeze({ cols: frozenCols, rows: frozenRows === menu.r + 1 ? 0 : menu.r + 1 }),
          )}
        </>
      )}
    </div>
  );

  function leftOf(id: string): string | null {
    // "Insert left" is "insert right of the column before"; the menu passes the shown order.
    const shown = [...document.querySelectorAll<HTMLElement>("th[data-col]")].map((th) => th.dataset.col!);
    const at = shown.indexOf(id);
    return at > 0 ? shown[at - 1] : null;
  }
}

const SheetLine = memo(function SheetLine({
  refRow,
  index,
  columns,
  eventId,
  book,
  overlay,
  lefts,
  frozenCols,
  stickyTop,
  activeC,
  selLeft,
  selRight,
  fillCols,
  handleC,
  editing,
  choices,
  onPick,
  onOpen,
  onMenu,
  onFillStart,
  onEditChange,
  onEditKey,
  onEditBlur,
  onChoose,
}: {
  refRow: SheetRowRef;
  index: number;
  columns: ColumnDef[];
  eventId: string;
  book: Workbook;
  overlay: Map<string, string>;
  lefts: number[];
  frozenCols: number;
  stickyTop: number | null;
  activeC: number;
  selLeft: number;
  selRight: number;
  fillCols: [number, number] | null;
  handleC: number;
  editing: Editing | null;
  choices: string[] | null;
  onPick: (r: number, c: number, extend: boolean, event: ReactMouseEvent) => void;
  onOpen: (r: number, c: number) => void;
  onMenu: (kind: "row" | "cell", r: number, c: number, event: ReactMouseEvent) => void;
  onFillStart: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  onEditChange: (text: string) => void;
  onEditKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onEditBlur: () => void;
  onChoose: (text: string) => void;
}) {
  const top = stickyTop === null ? undefined : stickyTop;
  const participant = refRow.kind === "participant" ? refRow.row : null;
  return (
    <tr
      data-line
      aria-rowindex={index + 2}
      aria-selected={selLeft >= 0 ? true : undefined}
      className={[refRow.kind === "operator" ? "sheet-row--operator" : "", stickyTop !== null ? "sheet-row--frozen" : ""].filter(Boolean).join(" ") || undefined}
    >
      <th
        scope="row"
        className="sheet-gutter roster__sticky"
        style={top !== undefined ? { top } : undefined}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          onPick(index, 0, false, event);
          onPick(index, columns.length - 1, true, event);
        }}
        onContextMenu={(event) => onMenu("row", index, 0, event)}
        title={refRow.kind === "operator" ? "운영 줄: 운영자만 보는 행" : undefined}
      >
        {refRow.number}
      </th>
      {columns.map((column, c) => {
        const key = cellKey(refRow.key, column.id);
        const pending = overlay.get(key);
        const held = refRow.kind === "operator" || isOperatorColumn(column.id);
        const text = pending ?? (held ? book.display(refRow.key, column.id) : participant ? column.text(participant) : "");
        const format = book.format(refRow.key, column.id);
        const value = held && pending === undefined ? book.value(refRow.key, column.id) : null;
        return (
          <DataCell
            key={column.id}
            column={column}
            row={participant}
            operator={refRow.kind === "operator"}
            eventId={eventId}
            text={text}
            numeric={typeof value === "number"}
            error={typeof value === "object" && value !== null}
            formula={held && book.isFormula(refRow.key, column.id)}
            format={format}
            r={index}
            c={c}
            left={c < frozenCols ? lefts[c] : undefined}
            top={top}
            active={activeC === c}
            selected={selLeft >= 0 && c >= selLeft && c <= selRight}
            filling={!!fillCols && c >= fillCols[0] && c <= fillCols[1]}
            handle={handleC === c}
            editing={editing && editing.c === c ? editing : null}
            choices={editing && editing.c === c ? choices : null}
            onPick={onPick}
            onOpen={onOpen}
            onMenu={onMenu}
            onFillStart={onFillStart}
            onEditChange={onEditChange}
            onEditKey={onEditKey}
            onEditBlur={onEditBlur}
            onChoose={onChoose}
          />
        );
      })}
    </tr>
  );
});

function HeaderCell({
  column,
  index,
  letter,
  sorts,
  filtered,
  width,
  frozen,
  left,
  selected,
  dragging,
  onSort,
  onSelect,
  onMenu,
  onResizeStart,
  onResizeKey,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  column: ColumnDef;
  index: number;
  letter: string;
  sorts: Sort[];
  filtered: boolean;
  width: number;
  frozen: boolean;
  left: number;
  selected: boolean;
  dragging: boolean;
  onSort: (add: boolean) => void;
  onSelect: (extend: boolean) => void;
  onMenu: (event: ReactMouseEvent) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  onResizeKey: (delta: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const at = sorts.findIndex((sort) => sort.id === column.id);
  const sort = at >= 0 ? sorts[at] : null;
  const [over, setOver] = useState(false);
  return (
    <th
      scope="col"
      data-col={column.id}
      aria-colindex={index + 2}
      aria-sort={sort ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={[frozen ? "roster__sticky" : "", isOperatorColumn(column.id) ? "sheet-head--operator" : "", selected ? "is-selected" : "", dragging ? "is-dragging" : "", over ? "is-drop" : ""]
        .filter(Boolean)
        .join(" ") || undefined}
      style={frozen ? { left } : undefined}
      draggable={column.id !== "person"}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", column.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDrop();
      }}
      onContextMenu={onMenu}
    >
      <button type="button" className="sheet-head__letter" tabIndex={-1} onClick={(event) => onSelect(event.shiftKey)} aria-label={`${letter}열 선택`}>
        {letter}
      </button>
      <span className="sheet-head__main">
        <button
          type="button"
          className="roster__sort"
          title="누르면 정렬, Shift를 누른 채 누르면 정렬 기준을 더해요. 오른쪽 클릭으로 열 메뉴"
          onClick={(event) => onSort(event.shiftKey)}
        >
          <span className="roster__label">{column.label}</span>
          <span className="roster__arrow" aria-hidden="true">
            {sort ? (sort.dir === "asc" ? "▲" : "▼") : ""}
            {sort && sorts.length > 1 ? <sub>{at + 1}</sub> : null}
          </span>
          {filtered ? (
            <svg className="sheet-head__filtered" viewBox="0 0 12 12" width="12" height="12" role="img" aria-label="필터 걸림">
              <path d="M1 2h10L7 6.5V10L5 11V6.5z" fill="currentColor" />
            </svg>
          ) : null}
        </button>
        <button type="button" className="sheet-head__menu" aria-label={`${column.label} 열 메뉴`} onClick={onMenu}>
          ▾
        </button>
      </span>
      <span
        className="roster__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={`${column.label} 열 너비`}
        aria-valuenow={width}
        aria-valuemin={64}
        aria-valuemax={640}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onResizeKey(event.key === "ArrowLeft" ? -16 : 16);
          }
        }}
      />
    </th>
  );
}

function DataCell({
  column,
  row,
  operator,
  eventId,
  text,
  numeric,
  error,
  formula,
  format,
  r,
  c,
  left,
  top,
  active,
  selected,
  filling,
  handle,
  editing,
  choices,
  onPick,
  onOpen,
  onMenu,
  onFillStart,
  onEditChange,
  onEditKey,
  onEditBlur,
  onChoose,
}: {
  column: ColumnDef;
  row: TableRow | null;
  operator: boolean;
  eventId: string;
  text: string;
  numeric: boolean;
  error: boolean;
  formula: boolean;
  format: CellFormat | undefined;
  r: number;
  c: number;
  left?: number;
  top?: number;
  active: boolean;
  selected: boolean;
  filling: boolean;
  handle: boolean;
  editing: Editing | null;
  choices: string[] | null;
  onPick: (r: number, c: number, extend: boolean, event: ReactMouseEvent) => void;
  onOpen: (r: number, c: number) => void;
  onMenu: (kind: "row" | "cell", r: number, c: number, event: ReactMouseEvent) => void;
  onFillStart: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  onEditChange: (text: string) => void;
  onEditKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onEditBlur: () => void;
  onChoose: (text: string) => void;
}) {
  const classes = [
    left !== undefined ? "roster__sticky" : "",
    c === 0 && row ? "roster__person" : "",
    !text && column.type !== "status" ? "roster__muted" : "",
    selected ? "is-selected" : "",
    active ? "is-active" : "",
    filling ? "is-fill" : "",
    editing ? "is-editing" : "",
    error ? "sheet-cell--error" : "",
    formula ? "sheet-cell--formula" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const align = format?.align ?? (numeric ? "right" : undefined);
  const style = {
    ...(left !== undefined ? { left } : {}),
    ...(top !== undefined ? { position: "sticky" as const, top, zIndex: left !== undefined ? 4 : 2 } : {}),
    ...(format?.fill ? { background: format.fill } : {}),
    ...(format?.color ? { color: format.color } : {}),
    ...(format?.b ? { fontWeight: 700 } : {}),
    ...(format?.i ? { fontStyle: "italic" as const } : {}),
    ...(format?.s || format?.u ? { textDecoration: [format.s ? "line-through" : "", format.u ? "underline" : ""].filter(Boolean).join(" ") } : {}),
    ...(align ? { textAlign: align } : {}),
  };
  const common = {
    "data-r": r,
    "data-c": c,
    "aria-colindex": c + 2,
    "aria-selected": selected || undefined,
    tabIndex: active ? 0 : -1,
    className: classes || undefined,
    title: text || undefined,
    style,
    onMouseDown: (event: ReactMouseEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("a,textarea,.sheet-choices")) return;
      onPick(r, c, event.shiftKey, event);
    },
    onContextMenu: (event: ReactMouseEvent) => {
      if (!selected) onPick(r, c, false, event);
      onMenu("cell", r, c, event);
    },
    onDoubleClick: () => onOpen(r, c),
  };
  const fillHandle = handle ? <span className="sheet-handle" aria-hidden="true" onPointerDown={onFillStart} /> : null;
  if (editing) {
    // Every option at first, as a dropdown; then the ones that match what is typed.
    const typed = editing.text === editing.start ? "" : editing.text.toLowerCase();
    const filtered = choices?.filter((choice) => !typed || choice.toLowerCase().includes(typed)) ?? null;
    const fnMatch = /(?:^=|[(,+\-*/&^=<>]\s*)([A-Za-z]{1,})$/.exec(editing.text);
    const functions = editing.text.startsWith("=") && fnMatch ? FUNCTION_NAMES.filter((name) => name.startsWith(fnMatch[1].toUpperCase())).slice(0, 6) : [];
    return (
      <td {...common} title={undefined}>
        <textarea
          className="sheet-editor"
          aria-label={`${column.label} 고치기`}
          autoFocus
          rows={1}
          value={editing.text}
          onChange={(event) => onEditChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Tab" && functions.length > 0 && fnMatch) {
              event.preventDefault();
              onEditChange(editing.text.slice(0, editing.text.length - fnMatch[1].length) + functions[0] + "(");
              return;
            }
            if (event.key === "Enter" && event.altKey) {
              event.preventDefault();
              onEditChange(editing.text + "\n");
              return;
            }
            onEditKey(event);
          }}
          onBlur={onEditBlur}
          onFocus={(event) => {
            const length = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(length, length);
          }}
        />
        {filtered && filtered.length > 0 ? (
          <span className="sheet-choices" role="listbox" aria-label="보기">
            {filtered.map((choice) => (
              <button key={choice} type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => onChoose(choice)}>
                {choice}
              </button>
            ))}
          </span>
        ) : null}
        {functions.length > 0 ? (
          <span className="sheet-choices sheet-choices--functions" role="listbox" aria-label="함수">
            {functions.map((name) => (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onEditChange(editing.text.slice(0, editing.text.length - fnMatch![1].length) + name + "(")}
              >
                {name}
              </button>
            ))}
          </span>
        ) : null}
      </td>
    );
  }
  if (column.type === "person" && row) {
    return (
      <td {...common}>
        <span className="roster__avatar" aria-hidden="true">
          {[...text.replace(/^\d+\s+/, "")][0] ?? "?"}
        </span>
        <Link tabIndex={-1} to={`/events/${eventId}/participants/${row.applicationId}`}>
          {text}
        </Link>
        {isEdited(row) ? (
          <span className="roster__tag roster__tag--edited" title={editedText(row)}>
            수정됨
          </span>
        ) : null}
        {isAdded(row) ? (
          <span className="roster__tag roster__tag--edited" title="운영자가 직접 추가한 참가자">
            직접 추가
          </span>
        ) : null}
        {fillHandle}
      </td>
    );
  }
  if (column.type === "status" && row) {
    return (
      <td {...common}>
        <span className={row.checkedInAt ? "roster__tag roster__tag--done" : "roster__tag"}>{text}</span>
        {fillHandle}
      </td>
    );
  }
  return (
    <td {...common}>
      {text || (operator || isOperatorColumn(column.id) ? "" : "–")}
      {fillHandle}
    </td>
  );
}
