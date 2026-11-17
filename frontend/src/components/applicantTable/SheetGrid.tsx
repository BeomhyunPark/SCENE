import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "react-router";
import type { TableRow } from "../../api/applications";
import {
  clampWidth,
  copyText,
  defaultWidth,
  groupRows,
  summarize,
  type ColumnDef,
  type Density,
  type Sort,
} from "./model";

type Cell = { r: number; c: number };

/** One line of the grid body: a group header, or an applicant at flat index `index`. */
type Line = { kind: "group"; key: string; label: string; count: number; open: boolean } | { kind: "row"; row: TableRow; index: number };

const PAGE_STEP = 10;
/** Pixels drawn above and below the visible part of the sheet. */
const OVERSCAN = 480;
const GUESS = { comfortable: { row: 60, group: 48 }, compact: { row: 36, group: 40 } } as const;

/**
 * The sheet part of 참가 현황 (#308 2단계). A real `grid`: the header row and the 참가자 column stay
 * put while the body scrolls both ways; arrow keys move between cells, Shift extends a range and
 * Ctrl/⌘+C copies the range as tab-separated text (only what is on screen). Enter or a double click
 * opens the application. Columns resize from the header edge, with the mouse or the arrow keys.
 */
export function SheetGrid({
  eventId,
  columns,
  rows,
  summaryRows,
  sorts,
  widths,
  density,
  groupBy,
  onSort,
  onResize,
  onOpen,
}: {
  eventId: string;
  columns: ColumnDef[];
  rows: TableRow[];
  /** Rows the summary line counts: the filtered rows, before grouping. */
  summaryRows: TableRow[];
  sorts: Sort[];
  widths: Record<string, number>;
  density: Density;
  groupBy: ColumnDef | null;
  onSort: (id: string, add: boolean) => void;
  onResize: (id: string, width: number) => void;
  onOpen: (row: TableRow) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Cell>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [notice, setNotice] = useState("");
  const [dragWidths, setDragWidths] = useState<Record<string, number>>({});
  const body = useRef<HTMLTableSectionElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(false);
  const [port, setPort] = useState({ top: 0, height: 0 });
  const [rowHeight, setRowHeight] = useState<number | null>(null);

  const { lines, flat } = useMemo(() => {
    const out: Line[] = [];
    const flatRows: TableRow[] = [];
    if (!groupBy) {
      rows.forEach((row) => {
        out.push({ kind: "row", row, index: flatRows.length });
        flatRows.push(row);
      });
      return { lines: out, flat: flatRows };
    }
    for (const group of groupRows(rows, groupBy)) {
      const open = !collapsed.has(group.key);
      out.push({ kind: "group", key: group.key, label: group.label, count: group.rows.length, open });
      if (!open) continue;
      for (const row of group.rows) {
        out.push({ kind: "row", row, index: flatRows.length });
        flatRows.push(row);
      }
    }
    return { lines: out, flat: flatRows };
  }, [rows, groupBy, collapsed]);

  // A range belongs to the rows it was made on: drop it when filters, sorting or grouping change.
  const [rangeRows, setRangeRows] = useState(flat);
  if (rangeRows !== flat) {
    setRangeRows(flat);
    setAnchor(null);
  }

  // Row windowing: only the rows near the visible part are in the DOM (300×35 is 10,000 cells).
  // Heights are fixed per density, measured from the first drawn row. Without a layout (tests,
  // a hidden tab) every row is drawn.
  const rowH = rowHeight ?? GUESS[density].row;
  const groupH = GUESS[density].group;
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const line of lines) {
      out.push(y);
      y += line.kind === "group" ? groupH : rowH;
    }
    out.push(y);
    return out;
  }, [lines, rowH, groupH]);
  const lineOfRow = useMemo(() => {
    const map: number[] = [];
    lines.forEach((line, at) => {
      if (line.kind === "row") map[line.index] = at;
    });
    return map;
  }, [lines]);
  const windowed = port.height > 0;
  let from = 0;
  let to = lines.length;
  if (windowed) {
    const top = port.top - OVERSCAN;
    const bottom = port.top + port.height + OVERSCAN;
    while (from < lines.length && offsets[from + 1] < top) from++;
    to = from;
    while (to < lines.length && offsets[to] < bottom) to++;
  }
  const padTop = offsets[from];
  const padBottom = offsets[lines.length] - offsets[to];

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    // Re-render only when the drawn window has to move: the top is kept in steps of half the
    // overscan, so most scroll events (and every sideways scroll) change nothing.
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

  useEffect(() => {
    const first = body.current?.querySelector<HTMLElement>("tr[data-line]");
    if (!first) return;
    const spacing = density === "compact" ? 0 : 8;
    const measured = Math.round(first.getBoundingClientRect().height) + spacing;
    if (measured > spacing && measured !== rowHeight) setRowHeight(measured);
  }, [density, rowHeight, lines.length]);

  const lastRow = flat.length - 1;
  const lastCol = columns.length - 1;
  const cur = { r: Math.min(active.r, Math.max(lastRow, 0)), c: Math.min(active.c, lastCol) };
  const range = anchor
    ? {
        top: Math.min(anchor.r, cur.r),
        bottom: Math.max(anchor.r, cur.r),
        left: Math.min(anchor.c, cur.c),
        right: Math.max(anchor.c, cur.c),
      }
    : { top: cur.r, bottom: cur.r, left: cur.c, right: cur.c };

  useEffect(() => {
    if (!focusAfterMove.current) return;
    const cell = body.current?.querySelector<HTMLElement>(`[data-r="${cur.r}"][data-c="${cur.c}"]`);
    if (!cell) {
      // The row is outside the drawn window: scroll to it and focus on the next render.
      const el = sheet.current;
      const at = lineOfRow[cur.r];
      if (el && at !== undefined) el.scrollTop = Math.max(0, offsets[at] - el.clientHeight / 2);
      return;
    }
    focusAfterMove.current = false;
    cell.focus({ preventScroll: true });
    cell.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });

  function move(next: Cell, extend: boolean) {
    const target = { r: Math.max(0, Math.min(lastRow, next.r)), c: Math.max(0, Math.min(lastCol, next.c)) };
    if (extend) setAnchor((before) => before ?? cur);
    else setAnchor(null);
    setActive(target);
    focusAfterMove.current = true;
  }

  async function copy() {
    const slice = flat.slice(range.top, range.bottom + 1);
    const picked = columns.slice(range.left, range.right + 1);
    const text = copyText(slice, picked);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${slice.length}행 ${picked.length}열을 복사했어요.`);
    } catch {
      setNotice("복사하지 못했어요. 브라우저가 클립보드를 막았을 수 있어요.");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (flat.length === 0) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const extend = event.shiftKey;
    const keys: Record<string, () => void> = {
      ArrowUp: () => move({ r: cur.r - 1, c: cur.c }, extend),
      ArrowDown: () => move({ r: cur.r + 1, c: cur.c }, extend),
      ArrowLeft: () => move({ r: cur.r, c: cur.c - 1 }, extend),
      ArrowRight: () => move({ r: cur.r, c: cur.c + 1 }, extend),
      PageUp: () => move({ r: cur.r - PAGE_STEP, c: cur.c }, extend),
      PageDown: () => move({ r: cur.r + PAGE_STEP, c: cur.c }, extend),
      Home: () => move({ r: ctrl ? 0 : cur.r, c: 0 }, extend),
      End: () => move({ r: ctrl ? lastRow : cur.r, c: lastCol }, extend),
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copy();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setActive({ r: lastRow, c: lastCol });
      return;
    }
    if (event.key === "Enter" && !(event.target as HTMLElement).closest("a,button")) {
      event.preventDefault();
      onOpen(flat[cur.r]);
      return;
    }
    if (event.key === "Escape") setAnchor(null);
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
    const onMove = (moveEvent: PointerEvent) => {
      latest = clampWidth(startWidth + moveEvent.clientX - startX);
      setDragWidths((before) => ({ ...before, [column.id]: latest }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragWidths((before) => {
        const next = { ...before };
        delete next[column.id];
        return next;
      });
      if (latest !== startWidth) onResize(column.id, latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Stable handlers so a memoized row re-renders only when its own cells change.
  const curRef = useRef(cur);
  const onOpenRef = useRef(onOpen);
  useLayoutEffect(() => {
    curRef.current = cur;
    onOpenRef.current = onOpen;
  });
  const pick = useCallback((r: number, c: number, extend: boolean) => {
    if (extend) setAnchor((before) => before ?? curRef.current);
    else setAnchor(null);
    setActive({ r, c });
  }, []);
  const open = useCallback((row: TableRow) => onOpenRef.current(row), []);

  const total = columns.reduce((sum, column) => sum + width(column), 0) + 72;
  const multi = range.top !== range.bottom || range.left !== range.right;

  return (
    <>
      <div ref={sheet} className={`roster__sheet roster__sheet--${density}`}>
        <table
          className={`roster__table roster__table--${density}`}
          role="grid"
          aria-label="신청자 명단"
          aria-rowcount={flat.length + 2}
          aria-colcount={columns.length + 1}
          aria-multiselectable="true"
          style={{ width: total }}
        >
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} style={{ width: width(column) }} />
            ))}
            <col style={{ width: 72 }} />
          </colgroup>
          <thead>
            <tr aria-rowindex={1}>
              {columns.map((column, c) => (
                <HeaderCell
                  key={column.id}
                  column={column}
                  index={c}
                  sorts={sorts}
                  width={width(column)}
                  onSort={(add) => onSort(column.id, add)}
                  onResizeStart={(event) => startResize(column, event)}
                  onResizeKey={(delta) => onResize(column.id, clampWidth(width(column) + delta))}
                />
              ))}
              <th scope="col" className="roster__actions-head" aria-colindex={columns.length + 1}>
                작업
              </th>
            </tr>
          </thead>
          <tbody ref={body} onKeyDown={onKeyDown}>
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
                <SheetRow
                  key={`${line.index}:${line.row.applicationId}`}
                  row={line.row}
                  index={line.index}
                  columns={columns}
                  eventId={eventId}
                  activeC={cur.r === line.index ? cur.c : -1}
                  selLeft={multi && line.index >= range.top && line.index <= range.bottom ? range.left : -1}
                  selRight={multi && line.index >= range.top && line.index <= range.bottom ? range.right : -1}
                  onPick={pick}
                  onOpen={open}
                />
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
              {columns.map((column, c) => (
                <td key={column.id} className={c === 0 ? "roster__sticky" : undefined} title={summarize(summaryRows, column)}>
                  {summarize(summaryRows, column)}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 ? <p className="roster__empty">조건에 맞는 신청자가 없어요.</p> : null}
      </div>
      <p className="roster__hint roster__keys" aria-live="polite">
        {notice ||
          "칸을 누르고 화살표로 움직여요. Shift로 범위를 넓히고 Ctrl(⌘)+C로 복사, Enter나 두 번 누르기로 상세를 열어요."}
      </p>
    </>
  );
}

const SheetRow = memo(function SheetRow({
  row,
  index,
  columns,
  eventId,
  activeC,
  selLeft,
  selRight,
  onPick,
  onOpen,
}: {
  row: TableRow;
  index: number;
  columns: ColumnDef[];
  eventId: string;
  activeC: number;
  selLeft: number;
  selRight: number;
  onPick: (r: number, c: number, extend: boolean) => void;
  onOpen: (row: TableRow) => void;
}) {
  return (
    <tr data-line aria-rowindex={index + 2} aria-selected={selLeft >= 0 ? true : undefined}>
      {columns.map((column, c) => (
        <DataCell
          key={column.id}
          column={column}
          row={row}
          eventId={eventId}
          r={index}
          c={c}
          active={activeC === c}
          selected={selLeft >= 0 && c >= selLeft && c <= selRight}
          onPick={(extend) => onPick(index, c, extend)}
          onOpen={() => onOpen(row)}
        />
      ))}
      <td className="roster__actions" aria-colindex={columns.length + 1}>
        <Link
          className="roster__detail"
          tabIndex={-1}
          to={`/events/${eventId}/participants/${row.applicationId}`}
          aria-label={`${columns[0].text(row)} 상세`}
        >
          상세
        </Link>
      </td>
    </tr>
  );
});

function HeaderCell({
  column,
  index,
  sorts,
  width,
  onSort,
  onResizeStart,
  onResizeKey,
}: {
  column: ColumnDef;
  index: number;
  sorts: Sort[];
  width: number;
  onSort: (add: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  onResizeKey: (delta: number) => void;
}) {
  const at = sorts.findIndex((sort) => sort.id === column.id);
  const sort = at >= 0 ? sorts[at] : null;
  return (
    <th
      scope="col"
      aria-colindex={index + 1}
      aria-sort={sort ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={index === 0 ? "roster__sticky" : undefined}
    >
      <button
        type="button"
        className="roster__sort"
        title="누르면 정렬, Shift를 누른 채 누르면 정렬 기준을 더해요"
        onClick={(event) => onSort(event.shiftKey)}
      >
        <span className="roster__label">{column.label}</span>
        <span className="roster__arrow" aria-hidden="true">
          {sort ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
          {sort && sorts.length > 1 ? <sub>{at + 1}</sub> : null}
        </span>
      </button>
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
  eventId,
  r,
  c,
  active,
  selected,
  onPick,
  onOpen,
}: {
  column: ColumnDef;
  row: TableRow;
  eventId: string;
  r: number;
  c: number;
  active: boolean;
  selected: boolean;
  onPick: (extend: boolean) => void;
  onOpen: () => void;
}) {
  const text = column.text(row);
  const classes = [
    c === 0 ? "roster__sticky roster__person" : "",
    !text && column.type !== "status" ? "roster__muted" : "",
    selected ? "is-selected" : "",
    active ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const common = {
    "data-r": r,
    "data-c": c,
    "aria-colindex": c + 1,
    "aria-selected": selected || undefined,
    tabIndex: active ? 0 : -1,
    className: classes || undefined,
    title: text || undefined,
    onMouseDown: (event: ReactMouseEvent) => {
      if ((event.target as HTMLElement).closest("a")) return;
      onPick(event.shiftKey);
    },
    onFocus: () => {
      if (!active) onPick(false);
    },
    onDoubleClick: onOpen,
  };
  if (column.type === "person") {
    return (
      <td {...common}>
        <span className="roster__avatar" aria-hidden="true">
          {[...text.replace(/^\d+\s+/, "")][0] ?? "?"}
        </span>
        <Link tabIndex={-1} to={`/events/${eventId}/participants/${row.applicationId}`}>
          {text}
        </Link>
      </td>
    );
  }
  if (column.type === "status") {
    return (
      <td {...common}>
        <span className={row.checkedInAt ? "roster__tag roster__tag--done" : "roster__tag"}>{text}</span>
      </td>
    );
  }
  return <td {...common}>{text || "–"}</td>;
}
