import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ApplicationTable, TableRow } from "../../api/applications";
import { Select } from "../Select";
import {
  EDITED,
  EDITED_KEY,
  isEdited,
  applyFilters,
  bucketsOf,
  buildColumns,
  countBy,
  crossCount,
  isActive,
  NONE,
  readView,
  sortRows,
  toggleSort,
  visibleColumns,
  writeView,
  type ColumnDef,
  type Filter,
  type ViewState,
} from "./model";
import { SheetGrid } from "./SheetGrid";
import { RulesPanel } from "./RulesPanel";
import { operatorColumns, operatorKey, participantKey, placeOperatorColumns, Workbook, type SheetRowRef } from "./sheet";
import { useRosterSheet } from "./useRosterSheet";
import "./ApplicantTable.css";

/** A text column offers value checkboxes when it has at most this many distinct answers (또래, 셀). */
const VALUE_LIST_MAX = 40;

type Panel = "filter" | "withdrawn" | "rules" | null;

/**
 * 참가 현황 (#308, Figma P03-01 1325:5059). One table of every applicant: filter by any question,
 * sort by headers, count one column or two crossed. The view (except text searches) is in the
 * address so a refresh or a shared link keeps it. Copy is a draft.
 */
export function ApplicantTable({
  eventId,
  table,
  actions,
  onEdit,
  withdrawnPanel,
  mayWrite = false,
}: {
  eventId: string;
  table: ApplicationTable;
  /** Effective PARTICIPANT_WRITE on an event that is not archived: cells, columns and rows can change (#509). */
  mayWrite?: boolean;
  actions?: ReactNode;
  /** Opens the 현재 운영 정보 수정 drawer (#337). Without it the row has no 수정 button. */
  onEdit?: (row: TableRow) => void;
  /** 취소된 신청 (DEC-084 §9), opened by the "취소 N" chip; hidden by default and in no count. */
  withdrawnPanel?: ReactNode;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => readView(params), [params]);
  const [search, setSearch] = useState("");
  const [textFilters, setTextFilters] = useState<Record<string, Filter>>({});
  const [panel, setPanel] = useState<Panel>(null);

  const [rulesFor, setRulesFor] = useState<string | null>(null);
  const [filterFor, setFilterFor] = useState<string | null>(null);
  const base = useMemo(() => buildColumns(table), [table]);
  const findRow = useCallback(
    (rowKey: string) => table.rows.find((row) => participantKey(row) === rowKey),
    [table.rows],
  );
  const editor = useRosterSheet({ eventId, table, mayWrite, findRow });
  const doc = editor.doc;
  // The sheet (#509): operator columns read their values from the workbook, and the workbook reads
  // every column, so both are made together. Letters follow the reader's columns; row numbers are fixed.
  const { columns, book, shownIds, operatorRows } = useMemo(() => {
    let workbook: Workbook | null = null;
    const operators = operatorColumns(doc, () => workbook!);
    const all = [...base, ...operators];
    const defaults = visibleColumns(base, view.visible).map((column) => column.id);
    const explicit = view.visible ? ["person", ...view.visible.filter((id) => id !== "person")] : defaults;
    const known = new Set(all.map((column) => column.id));
    const ids = placeOperatorColumns(explicit.filter((id) => known.has(id)), doc, view.hidden);
    const order = [...ids, ...all.map((column) => column.id).filter((id) => !ids.includes(id))];
    const participants: SheetRowRef[] = table.rows.map((row, index) => ({ kind: "participant", key: participantKey(row), row, number: index + 1 }));
    const operatorRefs: SheetRowRef[] = doc.rows.map((row, index) => ({
      kind: "operator",
      key: operatorKey(row.id),
      id: row.id,
      number: table.rows.length + index + 1,
    }));
    workbook = new Workbook(doc, all, order, [...participants, ...operatorRefs]);
    return { columns: all, book: workbook, shownIds: ids, operatorRows: operatorRefs };
  }, [base, doc, view.visible, view.hidden, table.rows]);
  const phoneId = table.contactVisible ? (table.columns.find((column) => column.systemKey === "PHONE")?.fieldId ?? null) : null;
  // A shared address can name a question that is gone or that this reader cannot see; ignore it.
  const filters = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({ ...view.filters, ...textFilters }).filter(([id]) => columns.some((column) => column.id === id)),
      ),
    [view.filters, textFilters, columns],
  );
  const filtered = useMemo(
    () => applyFilters(table.rows, columns, filters, search, phoneId),
    [table.rows, columns, filters, search, phoneId],
  );
  const sorted = useMemo(() => sortRows(filtered, columns, view.sorts), [filtered, columns, view.sorts]);
  const byId = new Map(columns.map((column) => [column.id, column]));
  const shown = shownIds.map((id) => byId.get(id)).filter((column): column is ColumnDef => column !== undefined);
  const groupBy = columns.find((column) => column.id === view.groupBy && column.countable) ?? null;
  const activeCount = Object.values(filters).filter(isActive).length;

  function update(next: Partial<ViewState>) {
    setParams(writeView({ ...view, ...next }), { replace: true });
  }

  /** A text search stays in memory (it may be personal); every other condition goes to the address. */
  function setFilter(id: string, filter: Filter | null) {
    if (filter?.kind === "text") {
      setTextFilters((before) => ({ ...before, [id]: filter }));
      return;
    }
    if (textFilters[id]) {
      setTextFilters((before) => {
        const next = { ...before };
        delete next[id];
        return next;
      });
    }
    const next = { ...view.filters };
    if (filter) next[id] = filter;
    else delete next[id];
    update({ filters: next });
  }

  function clearAll() {
    setTextFilters({});
    setSearch("");
    update({ filters: {} });
  }

  const statusChips = chipsFor(table, columns, view.filters);

  return (
    <section className="roster" aria-labelledby="roster-title">
      <h2 id="roster-title" className="roster__sr">
        신청자
      </h2>
      <div className="roster__bar">
        <div className="roster__tabs" role="tablist" aria-label="보기">
          <TabButton selected={view.tab === "list"} onClick={() => update({ tab: "list" })}>
            명단
          </TabButton>
          <TabButton selected={view.tab === "count"} onClick={() => update({ tab: "count" })}>
            세기
          </TabButton>
        </div>
        <div className="roster__tools">
          <input
            className="roster__search"
            type="search"
            aria-label="이름, 연락처, 소속, 메모 검색"
            placeholder={table.contactVisible ? "이름, 연락처, 소속, 메모 검색" : "이름, 소속, 메모 검색"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {actions ? <span className="roster__divider" aria-hidden="true" /> : null}
          {actions}
        </div>
      </div>

      <div className="roster__chips">
        {statusChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="roster__chip"
            aria-pressed={chip.selected}
            onClick={() => {
              const next = { ...view.filters };
              delete next.status;
              delete next.group;
              delete next[EDITED];
              if (chip.filter) next[chip.filter.id] = { kind: "in", keys: [chip.filter.key] };
              update({ filters: next });
            }}
          >
            {chip.label} <span className="roster__chip-count">{chip.count}</span>
          </button>
        ))}
        {withdrawnPanel && table.withdrawn.length > 0 ? (
          <button
            type="button"
            className="roster__chip"
            aria-expanded={panel === "withdrawn"}
            onClick={() => setPanel(panel === "withdrawn" ? null : "withdrawn")}
          >
            취소 <span className="roster__chip-count">{table.withdrawn.length}</span>
          </button>
        ) : null}
      </div>

      {panel === "withdrawn" ? withdrawnPanel : null}
      {panel === "filter" ? (
        <FilterPanel
          key={filterFor ?? ""}
          columns={columns}
          rows={table.rows}
          filters={filters}
          initial={filterFor}
          onChange={setFilter}
          onClear={clearAll}
          onClose={() => setPanel(null)}
        />
      ) : null}

      <div className="roster__summary" aria-live="polite">
        <span>
          <strong>{filtered.length}명</strong>
          {filtered.length !== table.rows.length ? ` / 전체 ${table.rows.length}명` : ""}
        </span>
        <ActiveFilters columns={columns} rows={table.rows} filters={filters} search={search} onRemove={(id) => setFilter(id, null)} />
        {activeCount > 0 || search ? (
          <button type="button" className="roster__link scene-press scene-press--text" onClick={clearAll}>
            조건 모두 지우기
          </button>
        ) : null}
      </div>

      {view.tab === "list" ? (
        <>
          <div className="roster__layout" role="group" aria-label="표 모양">
            <label className="roster__field roster__field--inline">
              묶어 보기
              <Select
                value={groupBy?.id ?? ""}
                options={[
                  { value: "", label: "묶지 않음" },
                  ...columns.filter((column) => column.countable).map((column) => ({ value: column.id, label: column.label })),
                ]}
                onChange={(value) => update({ groupBy: value || null })}
              />
            </label>
            <div className="roster__segmented" role="radiogroup" aria-label="줄 간격">
              {(["comfortable", "compact"] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  role="radio"
                  aria-checked={view.density === density}
                  onClick={() => update({ density })}
                >
                  {density === "comfortable" ? "넉넉하게" : "촘촘하게"}
                </button>
              ))}
            </div>
          </div>
          {panel === "rules" ? (
            <RulesPanel
              columns={shown}
              rules={doc.rules}
              initial={rulesFor}
              mayWrite={editor.mayWrite}
              onChange={editor.setRules}
              onClose={() => setPanel(null)}
            />
          ) : null}
          <SheetGrid
            eventId={eventId}
            onEdit={onEdit}
            columns={shown}
            rows={sorted}
            operatorRows={operatorRows}
            book={book}
            editor={editor}
            summaryRows={filtered}
            sorts={view.sorts}
            widths={view.widths}
            density={view.density}
            groupBy={groupBy}
            freeze={view.freeze}
            onFreeze={(freeze) => update({ freeze })}
            onSort={(id, add, dir) =>
              update({ sorts: dir ? [{ id, dir }] : dir === null ? view.sorts.filter((sort) => sort.id !== id) : toggleSort(view.sorts, id, add) })
            }
            onResize={(id, width) => update({ widths: { ...view.widths, [id]: width } })}
            onOpen={(row) => navigate(`/events/${eventId}/participants/${row.applicationId}`)}
            onHide={(id) => {
              const visible = shown.map((column) => column.id).filter((item) => item !== id);
              update({ visible, hidden: id.startsWith("c:") ? [...view.hidden, id] : view.hidden });
            }}
            onMove={(id, before) => {
              const visible = shown.map((column) => column.id).filter((item) => item !== id);
              const at = before ? visible.indexOf(before) : visible.length;
              visible.splice(at < 0 ? visible.length : at, 0, id);
              update({ visible });
            }}
            filtered={new Set(Object.keys(filters).filter((id) => isActive(filters[id])))}
            hiddenColumns={columns.filter((column) => column.type !== "person" && !shownIds.includes(column.id))}
            onShow={(id, after) => {
              const visible = shown.map((column) => column.id).filter((item) => item !== id);
              visible.splice(visible.indexOf(after) + 1, 0, id);
              update({ visible, hidden: view.hidden.filter((item) => item !== id) });
            }}
            onFilter={(id, clear) => {
              if (clear) {
                setFilter(id, null);
                return;
              }
              setFilterFor(id);
              setPanel("filter");
            }}
            onRules={(colId) => {
              setRulesFor(colId);
              setPanel("rules");
            }}
          />
        </>
      ) : (
        <CountView
          columns={columns}
          rows={filtered}
          a={view.countA}
          b={view.countB}
          onAxes={(countA, countB) => update({ countA, countB })}
          onPick={(picks) => {
            const next = { ...view.filters };
            for (const [id, key] of picks) next[id] = { kind: "in", keys: [key] };
            update({ filters: next, tab: "list" });
          }}
        />
      )}
    </section>
  );
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={selected} className="roster__tab scene-press scene-press--quiet" onClick={onClick}>
      {children}
    </button>
  );
}

type Chip = { label: string; count: number; selected: boolean; filter: { id: string; key: string } | null };

function chipsFor(table: ApplicationTable, columns: ColumnDef[], filters: Record<string, Filter>): Chip[] {
  const selectedKey = (id: string) => {
    const filter = filters[id];
    return filter?.kind === "in" && filter.keys.length === 1 ? filter.keys[0] : null;
  };
  const status = selectedKey("status");
  const group = selectedKey("group");
  const edited = selectedKey(EDITED);
  const arrived = table.rows.filter((row) => row.checkedInAt).length;
  const chips: Chip[] = [
    { label: "전체 참가자", count: table.rows.length, selected: !status && !group && !edited, filter: null },
    { label: "도착 완료", count: arrived, selected: status === "arrived" && !group && !edited, filter: { id: "status", key: "arrived" } },
    { label: "도착 전", count: table.rows.length - arrived, selected: status === "waiting" && !group && !edited, filter: { id: "status", key: "waiting" } },
  ];
  if (columns.some((column) => column.id === "group")) {
    chips.push({
      label: "미배정",
      count: table.rows.filter((row) => !row.group).length,
      selected: group === NONE && !status && !edited,
      filter: { id: "group", key: NONE },
    });
  }
  const editedCount = table.rows.filter(isEdited).length;
  if (editedCount > 0) {
    chips.push({
      label: "수정됨",
      count: editedCount,
      selected: edited === EDITED_KEY && !status && !group,
      filter: { id: EDITED, key: EDITED_KEY },
    });
  }
  return chips;
}

function ActiveFilters({
  columns,
  rows,
  filters,
  search,
  onRemove,
}: {
  columns: ColumnDef[];
  rows: readonly TableRow[];
  filters: Record<string, Filter>;
  search: string;
  onRemove: (id: string) => void;
}) {
  const items = Object.entries(filters).filter(([, filter]) => isActive(filter));
  if (items.length === 0 && !search.trim()) return null;
  return (
    <ul className="roster__active" aria-label="걸린 조건">
      {search.trim() ? <li className="roster__pill">검색: {search.trim()}</li> : null}
      {items.map(([id, filter]) => {
        const column = columns.find((item) => item.id === id);
        if (!column) return null;
        return (
          <li key={id} className="roster__pill">
            {column.label}: {describe(column, rows, filter)}
            <button type="button" aria-label={`${column.label} 조건 지우기`} onClick={() => onRemove(id)}>
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function describe(column: ColumnDef, rows: readonly TableRow[], filter: Filter): string {
  if (filter.kind === "text") return `"${filter.query.trim()}" 포함`;
  if (filter.kind === "range") return `${filter.min || "처음"} ~ ${filter.max || "끝"}`;
  const labels = new Map(bucketsOf(column, rows).map((bucket) => [bucket.key, bucket.label]));
  return filter.keys.map((key) => labels.get(key) ?? key).join(", ");
}


function FilterPanel({
  columns,
  rows,
  filters,
  initial,
  onChange,
  onClear,
  onClose,
}: {
  columns: ColumnDef[];
  rows: readonly TableRow[];
  filters: Record<string, Filter>;
  /** The column whose menu opened the panel. */
  initial: string | null;
  onChange: (id: string, filter: Filter | null) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState<string[]>(initial ? [initial] : []);
  const ids = [...new Set([...Object.keys(filters), ...adding])].filter((id) => columns.some((column) => column.id === id));
  const available = columns.filter((column) => column.type !== "person" && !ids.includes(column.id));
  return (
    <div className="roster__panel" role="group" aria-label="필터">
      <p className="roster__hint">여러 조건을 걸면 모두 맞는 사람만 남아요. 한 질문 안에서 여러 보기를 고르면 그중 하나라도 맞으면 돼요.</p>
      <div className="roster__filters">
        {ids.map((id) => {
          const column = columns.find((item) => item.id === id)!;
          return (
            <FilterEditor
              key={id}
              column={column}
              rows={rows}
              filter={filters[id]}
              onChange={(filter) => onChange(id, filter)}
              onRemove={() => {
                setAdding((before) => before.filter((item) => item !== id));
                onChange(id, null);
              }}
            />
          );
        })}
      </div>
      <div className="roster__panel-foot">
        <label className="roster__field">
          조건 더하기
          <Select
            value=""
            options={[{ value: "", label: "질문 고르기" }, ...available.map((column) => ({ value: column.id, label: column.label }))]}
            onChange={(id) => {
              if (id) setAdding((before) => [...before, id]);
            }}
          />
        </label>
        {ids.length > 0 ? (
          <button
            type="button"
            className="roster__link scene-press scene-press--text"
            onClick={() => {
              setAdding([]);
              onClear();
            }}
          >
            모두 지우기
          </button>
        ) : null}
        <button type="button" className="roster__link scene-press scene-press--text" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

function FilterEditor({
  column,
  rows,
  filter,
  onChange,
  onRemove,
}: {
  column: ColumnDef;
  rows: readonly TableRow[];
  filter: Filter | undefined;
  onChange: (filter: Filter | null) => void;
  onRemove: () => void;
}) {
  const buckets = useMemo(() => bucketsOf(column, rows), [column, rows]);
  const counts = useMemo(() => new Map(countBy(rows, column).map((row) => [row.key, row.count])), [column, rows]);
  const ranged = column.type === "number" || column.type === "date";
  const listed = !ranged && (column.type !== "text" || buckets.length <= VALUE_LIST_MAX);
  const selected = filter?.kind === "in" ? filter.keys : [];
  return (
    <fieldset className="roster__filter">
      <legend>
        {column.label}
        <button type="button" className="roster__link scene-press scene-press--text" onClick={onRemove}>
          지우기
        </button>
      </legend>
      {column.type === "text" || column.type === "memo" ? (
        <input
          type="search"
          aria-label={`${column.label} 포함 검색`}
          placeholder="포함된 글자"
          value={filter?.kind === "text" ? filter.query : ""}
          onChange={(event) => onChange(event.target.value ? { kind: "text", query: event.target.value } : null)}
        />
      ) : null}
      {ranged ? (
        <div className="roster__range">
          <input
            type={column.type === "number" ? "number" : "date"}
            aria-label={`${column.label} 최소`}
            value={filter?.kind === "range" ? filter.min : ""}
            onChange={(event) => onChange(rangeOf(filter, { min: event.target.value }))}
          />
          <span>~</span>
          <input
            type={column.type === "number" ? "number" : "date"}
            aria-label={`${column.label} 최대`}
            value={filter?.kind === "range" ? filter.max : ""}
            onChange={(event) => onChange(rangeOf(filter, { max: event.target.value }))}
          />
        </div>
      ) : null}
      {listed ? (
        <div className="roster__options">
          {buckets.map((bucket) => (
            <label key={bucket.key}>
              <input
                type="checkbox"
                checked={selected.includes(bucket.key)}
                onChange={(event) => {
                  const keys = event.target.checked
                    ? [...selected, bucket.key]
                    : selected.filter((key) => key !== bucket.key);
                  onChange(keys.length > 0 ? { kind: "in", keys } : null);
                }}
              />
              {bucket.label}
              <span className="roster__muted"> {counts.get(bucket.key) ?? 0}</span>
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function rangeOf(filter: Filter | undefined, change: { min?: string; max?: string }): Filter | null {
  const before = filter?.kind === "range" ? filter : { kind: "range" as const, min: "", max: "" };
  const next = { ...before, ...change };
  return next.min === "" && next.max === "" ? null : next;
}

function CountView({
  columns,
  rows,
  a,
  b,
  onAxes,
  onPick,
}: {
  columns: ColumnDef[];
  rows: readonly TableRow[];
  a: string | null;
  b: string | null;
  onAxes: (a: string | null, b: string | null) => void;
  onPick: (picks: [string, string][]) => void;
}) {
  const countable = columns.filter((column) => column.countable);
  const first = countable.find((column) => column.id === a) ?? null;
  const second = countable.find((column) => column.id === b && column.id !== a) ?? null;
  return (
    <div className="roster__count">
      <div className="roster__axes">
        <label className="roster__field">
          세는 항목
          <Select
            value={first?.id ?? ""}
            options={[{ value: "", label: "질문 고르기" }, ...countable.map((column) => ({ value: column.id, label: column.label }))]}
            onChange={(value) => onAxes(value || null, second?.id ?? null)}
          />
        </label>
        <label className="roster__field">
          나눠 보기 (선택)
          <Select
            value={second?.id ?? ""}
            disabled={!first}
            options={[
              { value: "", label: "없음" },
              ...countable.filter((column) => column.id !== first?.id).map((column) => ({ value: column.id, label: column.label })),
            ]}
            onChange={(value) => onAxes(first?.id ?? null, value || null)}
          />
        </label>
      </div>
      {!first ? <p className="roster__hint">질문을 고르면 지금 걸러진 {rows.length}명을 보기별로 세요. 둘을 고르면 교차표가 나와요.</p> : null}
      {first && !second ? <Pivot column={first} rows={rows} onPick={(key) => onPick([[first.id, key]])} /> : null}
      {first && second ? <Cross a={first} b={second} rows={rows} onPick={(x, y) => onPick([[first.id, x], [second.id, y]])} /> : null}
    </div>
  );
}

function Pivot({ column, rows, onPick }: { column: ColumnDef; rows: readonly TableRow[]; onPick: (key: string) => void }) {
  const counts = countBy(rows, column);
  return (
    <div className="roster__scroll">
      <table className="roster__pivot" aria-label={`${column.label} 보기별 인원`}>
        <thead>
          <tr>
            <th scope="col">{column.label}</th>
            <th scope="col">인원</th>
            <th scope="col">비율</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((count) => {
            const share = rows.length === 0 ? 0 : Math.round((count.count / rows.length) * 100);
            return (
              <tr key={count.key}>
                <th scope="row" className={count.key === NONE ? "roster__muted" : undefined}>
                  {count.label}
                </th>
                <td>
                  <button type="button" className="roster__count-link" disabled={count.count === 0} aria-label={`${count.label} ${count.count}명 명단 보기`} onClick={() => onPick(count.key)}>
                    {count.count}
                  </button>
                </td>
                <td>
                  <span className="roster__bar-fill" style={{ width: share * 1.2 }} aria-hidden="true" />
                  {share}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">걸러진 사람</th>
            <td>{rows.length}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {column.type === "multi" ? <p className="roster__hint">여러 개를 고른 사람은 고른 보기마다 한 번씩 세요. 그래서 합이 사람 수보다 클 수 있어요.</p> : null}
    </div>
  );
}

function Cross({ a, b, rows, onPick }: { a: ColumnDef; b: ColumnDef; rows: readonly TableRow[]; onPick: (x: string, y: string) => void }) {
  const cross = crossCount(rows, a, b);
  return (
    <div className="roster__scroll">
      <table className="roster__pivot roster__cross" aria-label={`${a.label} × ${b.label}`}>
        <thead>
          <tr>
            <th scope="col">
              {a.label} \ {b.label}
            </th>
            {cross.columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
            <th scope="col">합</th>
          </tr>
        </thead>
        <tbody>
          {cross.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {cross.columns.map((column) => {
                const count = cross.cells[row.key][column.key] ?? 0;
                return (
                  <td key={column.key}>
                    <button
                      type="button"
                      className="roster__count-link"
                      disabled={count === 0}
                      aria-label={`${row.label} · ${column.label} ${count}명 명단 보기`}
                      onClick={() => onPick(row.key, column.key)}
                    >
                      {count}
                    </button>
                  </td>
                );
              })}
              <td>{cross.rowTotals[row.key] ?? 0}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">합</th>
            {cross.columns.map((column) => (
              <td key={column.key}>{cross.columnTotals[column.key] ?? 0}</td>
            ))}
            <td>{rows.length}</td>
          </tr>
        </tfoot>
      </table>
      {a.type === "multi" || b.type === "multi" ? (
        <p className="roster__hint">여러 개를 고른 사람은 고른 보기마다 한 번씩 세요.</p>
      ) : null}
    </div>
  );
}
