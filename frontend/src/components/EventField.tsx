import { useEffect, useRef, useState } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import searchIcon from "../assets/icon-search.svg";
import {
  CANCEL_REASON_MAX,
  getCheckInSummary,
  listAllCheckInRoster,
  listCheckInRoster,
  ROSTER_QUERY_MAX,
  type ArrivalStatus,
  type CancelResult,
  type CheckInResult,
  type RosterItem,
  type SummaryArrival,
} from "../api/checkIns";
import { isApiError } from "../api/errors";
import type { EventDetail, LifecycleStatus } from "../api/events";
import { getPublishedGroups, type PublishedGroups } from "../api/groups";
import { getMyPermissions } from "../api/operators";
import { pollQuery, reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { FieldScan } from "./EventFieldScan";
import { arrivalBasis } from "./fieldArrival";
import { useFieldRefresh } from "./fieldRefresh";
import { buildGroupStats, pendingFor, publishedGroupNames } from "./fieldGroupStats";
import { FieldGroups } from "./FieldGroups";
import { roomNoticeSuffix } from "../api/deskRoom";
import { checkInRecord } from "./fieldCheckInRecord";
import { FieldRosterRow, RowAction, StatusChip } from "./FieldRosterRow";
import { EventScreen } from "./EventScreen";
import { eventContext, formatSubmittedAt } from "./eventFormat";
import { readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import { participantLabel } from "./participantLabel";
import {
  isEventBlocked,
  useCheckInQueue,
  type ActionDelivery,
  type CheckInAction,
  type PendingRequest,
  type Settled,
} from "./useCheckInQueue";
import { useWideField } from "./useWideField";
import "./EventField.css";

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 250;

/** "overdue" and "unknown" filter by arrival standing (E4 #456); the others by check-in. */
type Filter = "all" | "pending" | "overdue" | "unknown" | "done";
type View = "all" | "groups";
type Notice = { tone: "success" | "info" | "error"; text: string };

/**
 * 현장 운영 (#285): arrival check-in by name or phone last 4 (DEC-071). Reads need EVENT_READ; check-in
 * and cancel need CHECKIN_WRITE and an ACTIVE event. ALREADY_CHECKED_IN·ALREADY_CANCELLED read as notices,
 * not errors. "QR 스캔" opens the rear camera (#286, EventFieldScan); it is blocked for the same reasons as
 * check-in. Requests go through useCheckInQueue (#287): one Idempotency-Key per action, short automatic
 * retries, then "확인 안 됨" with "다시 시도"; offline is shown, and coming back online resends and reloads.
 * A request whose result is unknown is never shown as done. "조별" (#288) groups the roster by the latest
 * published 조 편성 (DEC-072), not the working board; the QR result and the 전체 rows name that group too.
 * The summary and the roster on screen are read again every 10 seconds while the page is visible; the
 * "확인 HH:MM" chip in the head shows when they were read and reads at once when tapped (#408, fieldRefresh.ts).
 * Layout (#468): the phone follows Figma OM01 Field Home (622:7), one column of search, one status line and
 * participant cards; from 1024px it follows TL01 (620:7), the queue on the left and the picked participant
 * on the right, where the QR scanner also opens. Each row shows the 도착 예정 칸 and the room (G5 #460), and
 * the summary splits 미완료 into 왔어야 함·올 예정·지남·예정 모름 by the next meal (E4 #456, DEC-089
 * Follow-up); "왔어야 함" lists the same people as 식수 현황's 아직 안 옴. Copy is a draft.
 */
export function EventField() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>{(event, spaceName) => <FieldBody event={event} spaceName={spaceName} />}</EventScreen>
  );
}

function FieldBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const queryClient = useQueryClient();
  const eventId = event.eventId;
  const eventHref = `/events/${eventId}`;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("all");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [cancelling, setCancelling] = useState<RosterItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const wide = useWideField();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const summary = useQuery({
    queryKey: queryKeys.checkInSummary(eventId),
    queryFn: ({ signal }) => getCheckInSummary(eventId, signal),
  });
  const checkedIn = filter === "done" ? true : filter === "pending" ? false : null;
  const arrival: ArrivalStatus | null = filter === "overdue" ? "OVERDUE" : filter === "unknown" ? "UNKNOWN" : null;
  const roster = useInfiniteQuery({
    queryKey: queryKeys.checkInRoster(eventId, { q, checkedIn, arrival }),
    queryFn: ({ pageParam, signal }) =>
      listCheckInRoster(
        eventId,
        {
          q: q || undefined,
          checkedIn: checkedIn ?? undefined,
          arrival: arrival ?? undefined,
          page: pageParam,
          size: PAGE_SIZE,
        },
        signal,
      ),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => (last.page.number + 1 < last.page.totalPages ? last.page.number + 1 : undefined),
  });
  const published = useQuery({
    queryKey: queryKeys.publishedGroups(eventId),
    queryFn: ({ signal }) => getPublishedGroups(eventId, signal),
  });
  const rosterAll = useQuery({
    queryKey: queryKeys.checkInRosterAll(eventId),
    queryFn: ({ signal }) => listAllCheckInRoster(eventId, signal),
    enabled: view === "groups" && Boolean(published.data?.publishedAt),
    placeholderData: keepPreviousData,
  });
  const groupNames = published.data?.publishedAt ? publishedGroupNames(published.data) : null;
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
    retry: false,
  });

  const status: LifecycleStatus = summary.data?.eventStatus ?? event.lifecycleStatus;
  const mayWrite = permissions.data?.effective.includes("CHECKIN_WRITE") ?? false;
  const blocked = blockedReason(status, mayWrite, permissions.isPending);
  const scanOpen = scanning && !blocked && mayWrite;

  // Leaving the tab closes the scanner, so the camera does not stay on in the background.
  useEffect(() => {
    if (!scanOpen) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setScanning(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [scanOpen]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.checkIns(eventId) });
  }

  function searchInstead() {
    if (view === "all") {
      searchRef.current?.focus();
      return;
    }
    setView("all");
    // The search box mounts with the 전체 view, after this render.
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function onFailure(error: unknown, name: string) {
    if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
    }
    setNotice({ tone: "error", text: failureCopy(error, name) });
    refresh();
  }

  function report(action: CheckInAction, delivery: ActionDelivery) {
    if (delivery.kind === "refused") {
      onFailure(delivery.error, actionName(action));
      if (isEventBlocked(delivery.error)) setScanning(false);
      return;
    }
    setNotice(deliveryNotice(action, delivery));
  }

  const queue = useCheckInQueue(eventId, {
    onChanged: refresh,
    onReconnected: (settled) => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      if (settled.length === 1) report(settled[0].action, settled[0].delivery);
      else setNotice(reconnectNotice(settled));
    },
  });
  const pendingByTarget = new Map(queue.pending.map((item) => [item.target, item]));
  const [cancelBusy, setCancelBusy] = useState(false);

  function checkIn(item: RosterItem) {
    const action: CheckInAction = { kind: "check-in", mode: "MANUAL", participantId: item.participantId, name: participantLabel(item) };
    setNotice(null);
    void queue.submit(action).then((delivery) => report(action, delivery));
  }

  function cancel(item: RosterItem, checkInId: string, reason: string) {
    const action: CheckInAction = { kind: "cancel", checkInId, participantId: item.participantId, name: participantLabel(item), reason };
    setNotice(null);
    setCancelBusy(true);
    void queue.submit(action).then((delivery) => {
      setCancelBusy(false);
      setCancelling(null);
      report(action, delivery);
    });
  }

  function retry(request: PendingRequest) {
    setNotice(null);
    void queue.retry(request.target)?.then((delivery) => report(request.action, delivery));
  }

  const groupsReadable = view === "groups" && Boolean(published.data?.publishedAt);
  const listQuery = groupsReadable ? rosterAll : view === "all" ? roster : null;
  const { refreshNow, refreshing } = useFieldRefresh({
    online: queue.online,
    paused: queue.pending.some((request) => request.phase === "sending"),
    rosterHeld: searchFocused || cancelling !== null || scanOpen,
    readSummary: () => pollQuery(summary),
    readRoster: () => {
      if (groupsReadable) return pollQuery(rosterAll);
      if (view === "groups") return pollQuery(published);
      // A "더 보기" load in flight is not cut off; the next read picks the new page up.
      if (roster.isFetchingNextPage) return Promise.resolve();
      return pollQuery(roster);
    },
  });
  const readAt = lastReadAt(summary.dataUpdatedAt, listQuery?.dataUpdatedAt);

  const items = roster.data?.pages.flatMap((page) => page.items) ?? [];
  const total = roster.data?.pages[0]?.page.totalItems ?? 0;
  const context = [spaceName ?? "", eventContext(event)].filter(Boolean).join(" · ");

  // TL01 (desktop): the card picked in the queue, else the first one on screen.
  const queueItems = groupsReadable ? (rosterAll.data ?? []) : items;
  const selected = wide
    ? (queueItems.find((item) => item.participantId === selectedId) ?? queueItems[0] ?? null)
    : null;
  const selectedRequest = selected ? pendingFor(selected, pendingByTarget) : undefined;
  const selectItem = wide ? (item: RosterItem) => setSelectedId(item.participantId) : undefined;

  const scanner = scanOpen ? (
    <FieldScan
      submit={queue.submit}
      groupOf={groupNames ? (participantId) => groupNames.get(participantId) ?? null : undefined}
      onClose={() => setScanning(false)}
      onSearchInstead={() => {
        setScanning(false);
        searchInstead();
      }}
      onEventBlocked={(error) => {
        setScanning(false);
        onFailure(error, "");
      }}
    />
  ) : null;

  return (
    <OperatorShell
      title="현장 운영"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={readEventAreas(eventId)}
      participantsHref={`${eventHref}/participants`}
      tasksHref={`${eventHref}/tasks`}
      framed
      leading={
        <Link className="event-home__back scene-press scene-press--text" to={eventHref} aria-label="행사 홈">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-field">
        {/* OM01 622:12·622:13 and the "확인 14:50" chip (622:10): the time of the last read, tap to read now (#408). */}
        <header className="event-field__head">
          <div className="event-field__titles">
            <h2 className="event-field__event">{event.name}</h2>
            {context ? <p className="event-field__context">{context}</p> : null}
          </div>
          <button
            type="button"
            className="event-field__read"
            aria-label="새로 고침"
            aria-describedby="field-read-at"
            aria-busy={refreshing || undefined}
            title="10초마다 새로 읽어요"
            disabled={!queue.online}
            onClick={() => void refreshNow()}
          >
            <span aria-hidden="true">{readAt ? `확인 ${formatReadChip(readAt)}` : "확인 –"}</span>
          </button>
          <p className="event-field__sr-only" id="field-read-at">
            {readAt ? `${formatReadAt(readAt)}에 읽음` : "아직 읽지 못했어요"}
          </p>
        </header>

        {blocked ? (
          <p className="event-field__blocked" id="field-blocked" role="note">
            {blocked}
          </p>
        ) : null}

          {/* 보기 전환 (#288): Venture view tabs (Contact List 20:3612 "List · Kanban"), as P13 has no slot. */}
          <div className="event-field__views" role="group" aria-label="현황 보기">
            {(
              [
                ["all", "전체 명단"],
                ["groups", "조별 명단"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="event-field__view scene-press scene-press--quiet"
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </div>

        <div className={wide ? "event-field__layout event-field__layout--wide" : "event-field__layout"}>
          <div className="event-field__queue">
            {/* OM01 Quick Search (622:14); the QR scanner (#286) beside it takes the Filter Trigger shape of the
                SCENE DS Data Toolbar (ZFajaGIQ3VneNqkncKYXbJ 33:28·173:7736), as P13 has no slot. */}
            <div className="event-field__tools">
              {view === "all" ? (
                <div className="event-field__search">
                  <label className="event-field__sr-only" htmlFor="field-search">
                    이름 또는 전화 끝 4자리
                  </label>
                  <img className="event-field__search-icon" src={searchIcon} alt="" width={20} height={20} />
                  <input
                    id="field-search"
                    ref={searchRef}
                    className="event-field__search-input"
                    type="search"
                    value={search}
                    maxLength={ROSTER_QUERY_MAX}
                    autoComplete="off"
                    enterKeyHint="search"
                    placeholder="이름 또는 전화 끝 4자리"
                    onChange={(change) => setSearch(change.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="event-field__scan-open"
                aria-expanded={scanOpen}
                aria-describedby={blocked ? "field-blocked" : undefined}
                disabled={Boolean(blocked) || !mayWrite}
                onClick={() => {
                  setNotice(null);
                  setScanning((open) => !open);
                }}
              >
                <QrIcon />
                QR 스캔
              </button>
            </div>

            {/* OM01 622:21 "전체 104명 · 미도착 24명", in the product's words, with 식수 현황 at the line's end. */}
            <div className="event-field__status">
            <section className="event-field__summary" aria-label="체크인 현황">
              {summary.data ? (
                <>
                  <p className="event-field__count">
                    <span>전체</span> <strong>{summary.data.total.toLocaleString("ko-KR")}</strong>명
                  </p>
                  <p className="event-field__count">
                    <span>미완료</span> <strong>{summary.data.notCheckedIn.toLocaleString("ko-KR")}</strong>명
                  </p>
                  <p className="event-field__count event-field__count--done">
                    <span>체크인 완료</span> <strong>{summary.data.checkedIn.toLocaleString("ko-KR")}</strong>명
                  </p>
                </>
              ) : summary.isError ? (
                <div className="event-field__inline-error">
                  <p>현황을 불러오지 못했어요.</p>
                  <Button type="button" variant="secondary" size={32} onClick={() => reloadQuery(summary)}>
                    다시 시도
                  </Button>
                </div>
              ) : (
                <p className="event-field__muted">현황을 불러오는 중이에요.</p>
              )}
            </section>
            {/* 식수 현황 바로 가기 (#454, DEC-089 §11). */}
            <Link className="event-field__meals-link scene-press scene-press--text" to={`${eventHref}/meals`}>
              식수 현황 보기
            </Link>
            </div>

            {summary.data?.arrival ? (
              <ArrivalSummary
                arrival={summary.data.arrival}
                onOverdue={() => {
                  setView("all");
                  setFilter("overdue");
                }}
              />
            ) : null}

            {/* TL01 filter chips (620:19); the count (620:17) only for a search. */}
            <div className="event-field__controls">
              {view === "all" ? (
                <div className="event-field__filters" role="group" aria-label="체크인 상태로 보기">
                  {filterChoices(summary.data?.arrival ?? null, filter).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className="event-field__filter scene-press scene-press--chip"
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                  {/* Without a search the count repeats the 체크인 현황 line above, so it shows only for a search (#495). */}
                  {roster.data && items.length > 0 && q !== "" ? (
                    <span className="event-field__count-text" aria-live="polite">
                      {total.toLocaleString("ko-KR")}명
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="event-field__notice-slot" aria-live="polite">
              {notice ? (
                <p
                  className={`event-field__notice event-field__notice--${notice.tone}`}
                  role={notice.tone === "error" ? "alert" : "status"}
                >
                  {notice.text}
                </p>
              ) : null}
            </div>

            {/* OM01 Connection Status (622:42) and OM10 (622:241): offline and requests not confirmed (#287). */}
            {!queue.online || queue.pending.length > 0 ? (
              <div className="event-field__connection">
                {!queue.online ? (
                  <p className="event-field__offline" role="status">
                    <span className="event-field__connection-chip">오프라인</span>
                    오프라인이에요. 연결되면 확인 안 된 요청을 다시 보내고 현황을 새로 불러올게요.
                  </p>
                ) : null}
                {queue.pending.length > 0 ? (
                  <PendingList pending={queue.pending} online={queue.online} onRetry={retry} />
                ) : null}
              </div>
            ) : null}

            {wide ? null : scanner}

            {view === "groups" ? (
              <GroupsSection
                published={published}
                rosterAll={rosterAll}
                pendingByTarget={pendingByTarget}
                disabled={Boolean(blocked)}
                onCheckIn={checkIn}
                onCancel={setCancelling}
                onRetry={retry}
                selectedId={selected?.participantId ?? null}
                onSelect={selectItem}
              />
            ) : (
              <>
                {roster.isPending ? <p className="event-field__muted">명단을 불러오는 중이에요.</p> : null}
                {roster.isError ? (
                  <div className="event-field__inline-error">
                    <p>명단을 불러오지 못했어요.</p>
                    <Button type="button" variant="secondary" size={32} onClick={() => void reloadQuery(roster)}>
                      다시 시도
                    </Button>
                  </div>
                ) : null}
                {roster.data && items.length === 0 ? <p className="event-field__muted">{emptyCopy(q, filter)}</p> : null}
                {items.length > 0 ? (
                  <ul className="event-field__list" aria-label="체크인 명단">
                    {items.map((item) => {
                      const request = pendingFor(item, pendingByTarget);
                      return (
                        <FieldRosterRow
                          key={item.participantId}
                          item={item}
                          note={groupNames ? (groupNames.get(item.participantId) ?? "조 없음") : undefined}
                          disabled={Boolean(blocked)}
                          request={request}
                          onCheckIn={() => checkIn(item)}
                          onCancel={() => setCancelling(item)}
                          onRetry={() => request && retry(request)}
                          selected={wide ? selected?.participantId === item.participantId : undefined}
                          onSelect={selectItem ? () => selectItem(item) : undefined}
                        />
                      );
                    })}
                  </ul>
                ) : null}
                {roster.hasNextPage ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size={40}
                    className="event-field__more"
                    loading={roster.isFetchingNextPage}
                    onClick={() => void roster.fetchNextPage()}
                  >
                    더 보기
                  </Button>
                ) : null}
              </>
            )}
          </div>

          {wide ? (
            <div className="event-field__side">
              {scanner ??
                (selected ? (
                  <SelectedDetail
                    item={selected}
                    group={groupNames ? (groupNames.get(selected.participantId) ?? "조 없음") : null}
                    request={selectedRequest}
                    disabled={Boolean(blocked)}
                    onCheckIn={() => checkIn(selected)}
                    onCancel={() => setCancelling(selected)}
                    onRetry={() => selectedRequest && retry(selectedRequest)}
                  />
                ) : null)}
            </div>
          ) : null}
        </div>
      </div>

      {cancelling?.checkIn ? (
        <CancelDialog
          item={cancelling}
          busy={cancelBusy}
          onClose={() => {
            if (!cancelBusy) setCancelling(null);
          }}
          onConfirm={(reason) => cancel(cancelling, cancelling.checkIn!.checkInId, reason)}
        />
      ) : null}
    </OperatorShell>
  );
}

/**
 * TL01 Participant Detail Panel (620:56), desktop only: the picked card in large type with its check-in
 * record and the main button for it (the row's is a quiet text button). Figma's 참가 유형·신청 상태 and "확인 보류" have no data or API
 * here, so they are left out.
 */
function SelectedDetail({
  item,
  group,
  request,
  disabled,
  onCheckIn,
  onCancel,
  onRetry,
}: {
  item: RosterItem;
  /** Published group name, or null before the first publish. */
  group: string | null;
  request: PendingRequest | undefined;
  disabled: boolean;
  onCheckIn: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const busy = request?.phase === "sending";
  const unknown = request !== undefined && !busy;
  const done = item.checkIn?.status === "CHECKED_IN";
  const label = participantLabel(item);
  const record = checkInRecord(item);
  return (
    <section className="event-field__detail" aria-labelledby="field-detail-name">
      <p className="event-field__detail-kicker">선택한 참가자</p>
      <div className="event-field__detail-head">
        <h3 className="event-field__detail-name" id="field-detail-name">
          {label}
        </h3>
        <StatusChip done={done} unknown={unknown} />
      </div>
      {item.phoneLast4 ? <p className="event-field__detail-meta">끝자리 {item.phoneLast4}</p> : null}
      {/* Read-only values as label-value rows, not field boxes (SCENE DS 05 참가자 상세 172:7, #485). The
          check-in state is the chip beside the name, so it is not repeated here. */}
      <dl className="event-field__detail-fields">
        {group !== null ? (
          <div className="event-field__detail-field">
            <dt>조</dt>
            <dd>{group}</dd>
          </div>
        ) : null}
        {record ? (
          <div className="event-field__detail-field">
            <dt>기록</dt>
            <dd>{record}</dd>
          </div>
        ) : null}
      </dl>
      <div className="event-field__detail-action">
        <RowAction
          label={label}
          done={done}
          busy={busy}
          request={unknown ? request : undefined}
          disabled={disabled}
          onCheckIn={onCheckIn}
          onCancel={onCancel}
          onRetry={onRetry}
        />
      </div>
    </section>
  );
}

function QrIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="12" y="2.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.5" y="12" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 12h2.5v2.5H12zM15 15h2.5v2.5H15zM15 12h2.5M12 17.5h1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** 미완료 by standing against the next meal (E4 #456). The 왔어야 함 count opens that list. */
function ArrivalSummary({ arrival, onOverdue }: { arrival: SummaryArrival; onOverdue: () => void }) {
  const n = (value: number) => `${value.toLocaleString("ko-KR")}명`;
  return (
    <section className="event-field__arrivals" aria-label="미완료 도착 예정">
      <p className="event-field__arrivals-basis">{arrivalBasis(arrival)}</p>
      <p className="event-field__arrivals-line">
        <button type="button" className="event-field__arrivals-overdue scene-press scene-press--text" onClick={onOverdue}>
          왔어야 함 <strong>{n(arrival.overdue)}</strong>
        </button>
        <span>올 예정 {n(arrival.coming)}</span>
        {arrival.passed > 0 ? <span>참석 칸 지남 {n(arrival.passed)}</span> : null}
        {arrival.unknown > 0 ? <span>예정 모름 {n(arrival.unknown)}</span> : null}
      </p>
    </section>
  );
}

/** "예정 모름" shows only when someone is unknown, or while it is the chosen filter. */
function filterChoices(arrival: SummaryArrival | null, filter: Filter): (readonly [Filter, string])[] {
  const choices: (readonly [Filter, string])[] = [
    ["all", "전체"],
    ["pending", "미완료"],
  ];
  if (arrival || filter === "overdue") choices.push(["overdue", "왔어야 함"]);
  if ((arrival && arrival.unknown > 0) || filter === "unknown") choices.push(["unknown", "예정 모름"]);
  choices.push(["done", "완료"]);
  return choices;
}

function GroupsSection({
  published,
  rosterAll,
  ...rest
}: {
  published: UseQueryResult<PublishedGroups>;
  rosterAll: UseQueryResult<RosterItem[]>;
} & Omit<Parameters<typeof FieldGroups>[0], "stats">) {
  if (published.isError) {
    if (isApiError(published.error, "FORBIDDEN")) {
      return <p className="event-field__muted">조 편성을 볼 권한이 없어요. 전체 보기에서 명단을 확인해 주세요.</p>;
    }
    return (
      <div className="event-field__inline-error">
        <p>공개된 조 편성을 불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(published)}>
          다시 시도
        </Button>
      </div>
    );
  }
  if (!published.data) return <p className="event-field__muted">조 편성을 불러오는 중이에요.</p>;
  if (!published.data.publishedAt) {
    return <p className="event-field__muted">아직 공개된 조 편성이 없어요. 조 편성을 공개하면 조별로 볼 수 있어요.</p>;
  }
  if (rosterAll.isError && !rosterAll.data) {
    return (
      <div className="event-field__inline-error">
        <p>명단을 불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(rosterAll)}>
          다시 시도
        </Button>
      </div>
    );
  }
  if (!rosterAll.data) return <p className="event-field__muted">명단을 불러오는 중이에요.</p>;
  return <FieldGroups stats={buildGroupStats(published.data, rosterAll.data)} {...rest} />;
}

function PendingList({
  pending,
  online,
  onRetry,
}: {
  pending: PendingRequest[];
  online: boolean;
  onRetry: (request: PendingRequest) => void;
}) {
  return (
    <section className="event-field__pending" aria-labelledby="field-pending-title">
      <h2 className="event-field__pending-title" id="field-pending-title">
        확인 안 된 요청 {pending.length.toLocaleString("ko-KR")}건
      </h2>
      <p className="event-field__pending-note">
        처리됐는지 아직 몰라요. 이 화면을 닫거나 새로 고치면 이 목록은 사라져요. 사라졌다면 명단에서 실제 상태를 확인해
        주세요.
      </p>
      <ul className="event-field__pending-list">
        {pending.map((request) => (
          <li key={request.target} className="event-field__pending-item">
            <div>
              <p className="event-field__pending-name">{actionLabel(request.action)}</p>
              <p className="event-field__meta">{phaseCopy(request.phase)}</p>
            </div>
            {request.phase === "sending" ? null : (
              <Button
                type="button"
                variant="secondary"
                size={40}
                disabled={!online}
                aria-label={`${actionLabel(request.action)} 다시 시도`}
                onClick={() => onRetry(request)}
              >
                다시 시도
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CancelDialog({
  item,
  busy,
  onClose,
  onConfirm,
}: {
  item: RosterItem;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      title={`${participantLabel(item)} 님의 체크인을 취소할까요?`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size={48} disabled={busy} onClick={onClose}>
            돌아가기
          </Button>
          <Button type="button" variant="danger" size={48} loading={busy} onClick={() => onConfirm(reason)}>
            취소하기
          </Button>
        </>
      }
    >
      <p>취소하면 미완료로 돌아가고, 다시 체크인할 수 있어요.</p>
      <label className="event-field__reason-label" htmlFor="field-cancel-reason">
        취소 사유 (선택)
      </label>
      <textarea
        id="field-cancel-reason"
        className="event-field__reason"
        value={reason}
        maxLength={CANCEL_REASON_MAX}
        rows={2}
        onChange={(change) => setReason(change.target.value)}
      />
    </ConfirmDialog>
  );
}

/** The older of the two reads, so the time never claims a list fresher than it is. 0 means never read. */
function lastReadAt(summaryAt: number, listAt: number | undefined): number | null {
  const reads = [summaryAt, listAt ?? summaryAt].filter((at) => at > 0);
  return reads.length === 2 ? Math.min(...reads) : null;
}

/** "14:50" for the head chip, as in Figma OM01 (622:10). */
function formatReadChip(at: number): string {
  return new Date(at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatReadAt(at: number): string {
  return new Date(at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function blockedReason(status: LifecycleStatus, mayWrite: boolean, permissionsPending: boolean): string | null {
  if (status === "DRAFT") return "행사를 시작하면 체크인할 수 있어요. 지금은 명단만 볼 수 있어요.";
  if (status === "ENDED") return "종료된 행사라 체크인과 취소를 할 수 없어요.";
  if (status === "ARCHIVED") return "보관된 행사라 체크인과 취소를 할 수 없어요.";
  if (permissionsPending) return null;
  if (!mayWrite) return "체크인 권한이 없어 명단만 볼 수 있어요. 행사 OWNER에게 권한을 요청해 주세요.";
  return null;
}

function actionName(action: CheckInAction): string {
  return action.kind === "check-in" && action.mode === "QR" ? "" : action.name;
}

function actionLabel(action: CheckInAction): string {
  if (action.kind === "cancel") return `${action.name} 님 체크인 취소`;
  if (action.mode === "QR") return "QR 스캔 체크인";
  return `${action.name} 님 체크인`;
}

function phaseCopy(phase: PendingRequest["phase"]): string {
  if (phase === "sending") return "보내는 중이에요.";
  if (phase === "offline") return "오프라인이라 연결되면 다시 보내요.";
  return "응답을 받지 못했어요. 다시 시도해 주세요.";
}

function deliveryNotice(action: CheckInAction, delivery: Exclude<ActionDelivery, { kind: "refused" }>): Notice {
  const label = actionLabel(action);
  // Labels end in 체크인 or 취소, so the particle follows the action.
  const [object, subject] = action.kind === "cancel" ? ["를", "가"] : ["을", "이"];
  if (delivery.kind === "offline") {
    return { tone: "info", text: `오프라인이에요. 연결되면 ${label}${object} 다시 보낼게요.` };
  }
  if (delivery.kind === "unconfirmed") {
    return {
      tone: "error",
      text: `${label}${subject} 처리됐는지 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.`,
    };
  }
  if (action.kind === "cancel") return cancelNotice(delivery.value as CancelResult, action.name);
  return checkInNotice(delivery.value as CheckInResult);
}

function reconnectNotice(settled: Settled[]): Notice {
  const left = settled.filter(
    (item) => item.delivery.kind === "unconfirmed" || item.delivery.kind === "offline",
  ).length;
  const refused = settled.filter((item) => item.delivery.kind === "refused").length;
  const sent = settled.length - left - refused;
  if (settled.length === 0) return { tone: "info", text: "다시 연결됐어요. 현황을 새로 불러왔어요." };
  const parts = [`다시 연결돼 ${sent.toLocaleString("ko-KR")}건을 처리했어요`];
  if (refused > 0) parts.push(`${refused.toLocaleString("ko-KR")}건은 처리할 수 없었어요`);
  if (left > 0) parts.push(`${left.toLocaleString("ko-KR")}건은 아직 확인 안 됨이에요`);
  return { tone: left + refused > 0 ? "error" : "success", text: `${parts.join(", ")}. 현황을 새로 불러왔어요.` };
}

function checkInNotice(result: CheckInResult): Notice {
  const name = participantLabel(result.participant);
  if (result.result === "ALREADY_CHECKED_IN") {
    const by = result.checkIn.checkedInByDisplayName ? ` · ${result.checkIn.checkedInByDisplayName}` : "";
    return {
      tone: "info",
      text: `${name} 님은 이미 체크인했어요 (${formatSubmittedAt(result.checkIn.checkedInAt)}${by}).${roomNoticeSuffix(result.room, result.lodging)}`,
    };
  }
  // 방 (G5 #460): the desk can tell the room right after the check-in.
  return { tone: "success", text: `${name} 님을 체크인했어요.${roomNoticeSuffix(result.room, result.lodging)}` };
}

function cancelNotice(result: CancelResult, name: string): Notice {
  if (result.result === "ALREADY_CANCELLED") return { tone: "info", text: `${name} 님의 체크인은 이미 취소돼 있어요.` };
  return { tone: "success", text: `${name} 님의 체크인을 취소했어요.` };
}

function failureCopy(error: unknown, name: string): string {
  if (isApiError(error, "EVENT_ENDED")) return "종료된 행사라 체크인과 취소를 할 수 없어요.";
  if (isApiError(error, "EVENT_ARCHIVED")) return "보관된 행사라 체크인과 취소를 할 수 없어요.";
  if (isApiError(error, "INVALID_STATE_TRANSITION")) {
    if (error.extensions.reason === "APPLICATION_NOT_SUBMITTED") {
      return `${name} 님은 신청을 철회해서 체크인할 수 없어요.`;
    }
    return "행사를 시작하면 체크인할 수 있어요.";
  }
  if (isApiError(error, "FORBIDDEN")) return "체크인 권한이 없어요.";
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return `${name} 님을 명단에서 찾지 못했어요. 명단을 새로 불러왔어요.`;
  return "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function emptyCopy(q: string, filter: Filter): string {
  if (q) return `'${q}'에 맞는 참가자가 없어요.`;
  if (filter === "pending") return "체크인하지 않은 참가자가 없어요.";
  if (filter === "done") return "아직 체크인한 참가자가 없어요.";
  if (filter === "overdue") return "지금까지 왔어야 하는데 아직 안 온 참가자가 없어요.";
  if (filter === "unknown") return "도착 예정을 모르는 미완료 참가자가 없어요.";
  return "신청을 마친 참가자가 아직 없어요.";
}
