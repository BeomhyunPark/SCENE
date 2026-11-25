import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ApplicationTable, TableRow } from "../../api/applications";
import { Button } from "../Button";
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
  moveColumn,
  NONE,
  readView,
  sortRows,
  toggleSort,
  visibleColumns,
  writeView,
  type ColumnDef,
  type Filter,
  type Sort,
  type ViewState,
} from "./model";
import { SheetGrid } from "./SheetGrid";
import "./ApplicantTable.css";

/** A text column offers value checkboxes when it has at most this many distinct answers (또래, 셀). */
const VALUE_LIST_MAX = 40;

type Panel = "sort" | "filter" | "columns" | "withdrawn" | null;

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
  editNote,
  withdrawnPanel,
}: {
  eventId: string;
  table: ApplicationTable;
  actions?: ReactNode;
  /** Opens the 현재 운영 정보 수정 drawer (#337). Without it the row has no 수정 button. */
  onEdit?: (row: TableRow) => void;
  /** Why there is no 수정 button, shown above the table. */
  editNote?: string;
  /** 취소된 신청 (DEC-084 §9), opened by the "취소 N" chip; hidden by default and in no count. */
  withdrawnPanel?: ReactNode;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => readView(params), [params]);
  const [search, setSearch] = useState("");
  const [textFilters, setTextFilters] = useState<Record<string, Filter>>({});
  const [panel, setPanel] = useState<Panel>(null);

  const columns = useMemo(() => buildColumns(table), [table]);
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
  const shown = visibleColumns(columns, view.visible);
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
          <Button
            type="button"
            variant="secondary"
            size={40}
            aria-expanded={panel === "sort"}
            onClick={() => setPanel(panel === "sort" ? null : "sort")}
          >
            정렬{view.sorts.length > 0 ? ` ${view.sorts.length}` : ""}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size={40}
            aria-expanded={panel === "filter"}
            onClick={() => setPanel(panel === "filter" ? null : "filter")}
          >
            필터{activeCount > 0 ? ` ${activeCount}` : ""}
          </Button>
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
        <button
          type="button"
          className="roster__chip roster__chip--add"
          aria-expanded={panel === "columns"}
          onClick={() => setPanel(panel === "columns" ? null : "columns")}
        >
          + 열 보기
        </button>
      </div>

      {panel === "withdrawn" ? withdrawnPanel : null}
      {panel === "sort" ? <SortPanel columns={columns} sorts={view.sorts} onChange={(sorts) => update({ sorts })} /> : null}
      {panel === "filter" ? (
        <FilterPanel columns={columns} rows={table.rows} filters={filters} onChange={setFilter} onClear={clearAll} />
      ) : null}
      {panel === "columns" ? (
        <ColumnsPanel
          eventId={eventId}
          columns={columns}
          visible={shown.map((column) => column.id)}
          onChange={(visible) => update({ visible })}
          params={params}
          onApply={(saved) => setParams(new URLSearchParams(saved), { replace: true })}
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
          {editNote ? <p className="roster__hint">{editNote}</p> : null}
          <SheetGrid
            eventId={eventId}
            onEdit={onEdit}
            columns={shown}
            rows={sorted}
            summaryRows={filtered}
            sorts={view.sorts}
            widths={view.widths}
            density={view.density}
            groupBy={groupBy}
            onSort={(id, add) => update({ sorts: toggleSort(view.sorts, id, add) })}
            onResize={(id, width) => update({ widths: { ...view.widths, [id]: width } })}
            onOpen={(row) => navigate(`/events/${eventId}/participants/${row.applicationId}`)}
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

function SortPanel({ columns, sorts, onChange }: { columns: ColumnDef[]; sorts: Sort[]; onChange: (sorts: Sort[]) => void }) {
  const unused = columns.filter((column) => !sorts.some((sort) => sort.id === column.id));
  return (
    <div className="roster__panel" role="group" aria-label="정렬">
      <p className="roster__hint">위에서부터 차례로 정렬해요. 표 머리글을 눌러도 되고, Shift를 누른 채 누르면 기준이 더해져요.</p>
      <ol className="roster__sort-list">
        {sorts.map((sort, index) => {
          const column = columns.find((item) => item.id === sort.id);
          return (
            <li key={sort.id}>
              <span>
                {index + 1}. {column?.label ?? sort.id}
              </span>
              <Select
                aria-label={`${column?.label ?? sort.id} 정렬 방향`}
                value={sort.dir}
                options={[
                  { value: "asc", label: "오름차순" },
                  { value: "desc", label: "내림차순" },
                ]}
                onChange={(value) => onChange(sorts.map((item) => (item.id === sort.id ? { ...item, dir: value as Sort["dir"] } : item)))}
              />
              <button type="button" className="roster__link scene-press scene-press--text" onClick={() => onChange(sorts.filter((item) => item.id !== sort.id))}>
                빼기
              </button>
            </li>
          );
        })}
      </ol>
      <label className="roster__field">
        정렬 기준 더하기
        <Select
          value=""
          options={[{ value: "", label: "열 고르기" }, ...unused.map((column) => ({ value: column.id, label: column.label }))]}
          onChange={(value) => {
            if (value) onChange([...sorts, { id: value, dir: "asc" }]);
          }}
        />
      </label>
    </div>
  );
}

function FilterPanel({
  columns,
  rows,
  filters,
  onChange,
  onClear,
}: {
  columns: ColumnDef[];
  rows: readonly TableRow[];
  filters: Record<string, Filter>;
  onChange: (id: string, filter: Filter | null) => void;
  onClear: () => void;
}) {
  const [adding, setAdding] = useState<string[]>([]);
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

type SavedView = { name: string; query: string };

function savedKey(eventId: string): string {
  return `scene.roster.views.${eventId}`;
}

function readSaved(eventId: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(savedKey(eventId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SavedView => typeof item?.name === "string" && typeof item?.query === "string")
      : [];
  } catch {
    return [];
  }
}

function writeSaved(eventId: string, views: SavedView[]) {
  try {
    window.localStorage.setItem(savedKey(eventId), JSON.stringify(views));
  } catch {
    // A private window may refuse storage; the view is still in the address.
  }
}

function ColumnsPanel({
  eventId,
  columns,
  visible,
  onChange,
  params,
  onApply,
}: {
  eventId: string;
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
  params: URLSearchParams;
  onApply: (query: string) => void;
}) {
  const [saved, setSaved] = useState(() => readSaved(eventId));
  const [name, setName] = useState("");
  return (
    <div className="roster__panel roster__panel--columns" role="group" aria-label="열 보기">
      <div>
        <p className="roster__hint">표에 보일 열과 순서를 정해요. 숨긴 열도 필터와 세기에는 쓸 수 있어요.</p>
        <ol className="roster__order" aria-label="보이는 열 순서">
          {visible
            .filter((id) => id !== "person")
            .map((id, index, list) => {
              const column = columns.find((item) => item.id === id);
              if (!column) return null;
              return (
                <li key={id}>
                  <label>
                    <input type="checkbox" checked onChange={() => onChange(visible.filter((item) => item !== id))} />
                    {column.label}
                  </label>
                  <span className="roster__order-buttons">
                    <button
                      type="button"
                      aria-label={`${column.label} 앞으로`}
                      disabled={index === 0}
                      onClick={() => onChange(moveColumn(visible, id, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${column.label} 뒤로`}
                      disabled={index === list.length - 1}
                      onClick={() => onChange(moveColumn(visible, id, 1))}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
        </ol>
        <div className="roster__options roster__options--columns" aria-label="숨긴 열">
          {columns
            .filter((column) => column.type !== "person" && !visible.includes(column.id))
            .map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => onChange([...visible.filter((id) => id !== "person"), column.id])}
                />
                {column.label}
              </label>
            ))}
        </div>
        <button type="button" className="roster__link scene-press scene-press--text" onClick={() => onChange(columns.filter((column) => column.defaultVisible).map((column) => column.id))}>
          기본 열로
        </button>
      </div>
      <div className="roster__saved">
        <p className="roster__hint">지금 필터·정렬·열을 이 브라우저에 이름 붙여 저장해요. 검색어는 저장하지 않아요.</p>
        <form
          className="roster__save"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            const next = [...saved.filter((view) => view.name !== trimmed), { name: trimmed, query: params.toString() }];
            setSaved(next);
            writeSaved(eventId, next);
            setName("");
          }}
        >
          <input aria-label="보기 이름" placeholder="보기 이름 (예: 1일차 식사)" value={name} maxLength={30} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" variant="secondary" size={32} disabled={!name.trim()}>
            보기 저장
          </Button>
        </form>
        {saved.length > 0 ? (
          <ul className="roster__saved-list" aria-label="저장한 보기">
            {saved.map((view) => (
              <li key={view.name}>
                <button type="button" className="roster__link scene-press scene-press--text" onClick={() => onApply(view.query)}>
                  {view.name}
                </button>
                <button
                  type="button"
                  aria-label={`${view.name} 보기 지우기`}
                  className="roster__link roster__muted scene-press scene-press--text"
                  onClick={() => {
                    const next = saved.filter((item) => item.name !== view.name);
                    setSaved(next);
                    writeSaved(eventId, next);
                  }}
                >
                  지우기
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
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
