import { useEffect, useId, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import {
  CANCEL_REASON_MAX,
  cancelCheckIn,
  checkInManually,
  getCheckInSummary,
  listCheckInRoster,
  newIdempotencyKey,
  ROSTER_QUERY_MAX,
  type CancelResult,
  type CheckInResult,
  type RosterItem,
} from "../api/checkIns";
import { isApiError } from "../api/errors";
import type { EventDetail, LifecycleStatus } from "../api/events";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { FieldScan } from "./EventFieldScan";
import { EventScreen } from "./EventScreen";
import { formatSubmittedAt } from "./eventFormat";
import { readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import "./EventField.css";

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 250;

type Filter = "all" | "pending" | "done";
type Notice = { tone: "success" | "info" | "error"; text: string };

/**
 * 현장 운영 (#285): arrival check-in by name or phone last 4 (DEC-071). Reads need EVENT_READ; check-in
 * and cancel need CHECKIN_WRITE and an ACTIVE event. Every request sends a fresh Idempotency-Key, and
 * ALREADY_CHECKED_IN·ALREADY_CANCELLED read as notices, not errors. "QR 스캔" opens the rear camera
 * (#286, EventFieldScan); it is blocked for the same reasons as check-in. Copy is a draft.
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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [cancelling, setCancelling] = useState<RosterItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const summary = useQuery({
    queryKey: queryKeys.checkInSummary(eventId),
    queryFn: ({ signal }) => getCheckInSummary(eventId, signal),
  });
  const checkedIn = filter === "all" ? null : filter === "done";
  const roster = useInfiniteQuery({
    queryKey: queryKeys.checkInRoster(eventId, { q, checkedIn }),
    queryFn: ({ pageParam, signal }) =>
      listCheckInRoster(
        eventId,
        { q: q || undefined, checkedIn: checkedIn ?? undefined, page: pageParam, size: PAGE_SIZE },
        signal,
      ),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => (last.page.number + 1 < last.page.totalPages ? last.page.number + 1 : undefined),
  });
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

  function onFailure(error: unknown, name: string) {
    if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
    }
    setNotice({ tone: "error", text: failureCopy(error, name) });
    refresh();
  }

  const checkIn = useMutation({
    mutationFn: (item: RosterItem) => checkInManually(eventId, item.participantId, newIdempotencyKey()),
    onMutate: () => setNotice(null),
    onSuccess: (result) => {
      setNotice(checkInNotice(result));
      refresh();
    },
    onError: (error, item) => onFailure(error, item.name),
  });
  const cancel = useMutation({
    mutationFn: (input: { item: RosterItem; checkInId: string; reason: string }) =>
      cancelCheckIn(eventId, input.checkInId, { reason: input.reason }, newIdempotencyKey()),
    onMutate: () => setNotice(null),
    onSuccess: (result, input) => {
      setCancelling(null);
      setNotice(cancelNotice(result, input.item.name));
      refresh();
    },
    onError: (error, input) => {
      setCancelling(null);
      onFailure(error, input.item.name);
    },
  });
  const pendingId = checkIn.isPending ? checkIn.variables?.participantId : undefined;
  const items = roster.data?.pages.flatMap((page) => page.items) ?? [];
  const total = roster.data?.pages[0]?.page.totalItems ?? 0;

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
        <Link className="event-home__back" to={eventHref} aria-label="행사 홈">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-field">
        <p className="event-field__event">{event.name}</p>

        <section className="event-field__summary" aria-label="체크인 현황">
          {summary.data ? (
            <>
              <p className="event-field__count">
                <span className="event-field__count-label">체크인 완료</span>
                <strong>{summary.data.checkedIn.toLocaleString("ko-KR")}</strong>
              </p>
              <p className="event-field__count">
                <span className="event-field__count-label">미완료</span>
                <strong>{summary.data.notCheckedIn.toLocaleString("ko-KR")}</strong>
              </p>
              <p className="event-field__count event-field__count--total">
                <span className="event-field__count-label">전체</span>
                <strong>{summary.data.total.toLocaleString("ko-KR")}</strong>
              </p>
            </>
          ) : summary.isError ? (
            <div className="event-field__inline-error">
              <p>현황을 불러오지 못했어요.</p>
              <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(summary)}>
                다시 시도
              </Button>
            </div>
          ) : (
            <p className="event-field__muted">현황을 불러오는 중이에요.</p>
          )}
        </section>

        {blocked ? (
          <p className="event-field__blocked" id="field-blocked" role="note">
            {blocked}
          </p>
        ) : null}

        {scanOpen ? (
          <FieldScan
            eventId={eventId}
            onClose={() => setScanning(false)}
            onSearchInstead={() => {
              setScanning(false);
              searchRef.current?.focus();
            }}
            onChanged={refresh}
            onEventBlocked={(error) => {
              setScanning(false);
              onFailure(error, "");
            }}
          />
        ) : (
          <Button
            type="button"
            variant="primary"
            size={48}
            className="event-field__scan-open"
            disabled={Boolean(blocked) || !mayWrite}
            aria-describedby={blocked ? "field-blocked" : undefined}
            onClick={() => {
              setNotice(null);
              setScanning(true);
            }}
          >
            QR 스캔
          </Button>
        )}

        <div className="event-field__search">
          <label className="event-field__search-label" htmlFor="field-search">
            이름 또는 전화 끝 4자리
          </label>
          <input
            id="field-search"
            ref={searchRef}
            className="event-field__search-input"
            type="search"
            value={search}
            maxLength={ROSTER_QUERY_MAX}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="예: 김하늘, 1234"
            onChange={(change) => setSearch(change.target.value)}
          />
        </div>

        <div className="event-field__filters" role="group" aria-label="체크인 상태로 보기">
          {(
            [
              ["all", "전체"],
              ["pending", "미완료"],
              ["done", "완료"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="event-field__filter"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
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

        {roster.isPending ? <p className="event-field__muted">명단을 불러오는 중이에요.</p> : null}
        {roster.isError ? (
          <div className="event-field__inline-error">
            <p>명단을 불러오지 못했어요.</p>
            <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(roster)}>
              다시 시도
            </Button>
          </div>
        ) : null}
        {roster.data && items.length === 0 ? <p className="event-field__muted">{emptyCopy(q, filter)}</p> : null}
        {items.length > 0 ? (
          <>
            <p className="event-field__muted" aria-live="polite">
              {total.toLocaleString("ko-KR")}명
            </p>
            <ul className="event-field__list" aria-label="체크인 명단">
              {items.map((item) => (
                <RosterRow
                  key={item.participantId}
                  item={item}
                  disabled={Boolean(blocked)}
                  busy={pendingId === item.participantId}
                  onCheckIn={() => checkIn.mutate(item)}
                  onCancel={() => setCancelling(item)}
                />
              ))}
            </ul>
          </>
        ) : null}
        {roster.hasNextPage ? (
          <Button
            type="button"
            variant="secondary"
            size={48}
            className="event-field__more"
            loading={roster.isFetchingNextPage}
            onClick={() => void roster.fetchNextPage()}
          >
            더 보기
          </Button>
        ) : null}
      </div>

      {cancelling?.checkIn ? (
        <CancelDialog
          item={cancelling}
          busy={cancel.isPending}
          onClose={() => {
            if (!cancel.isPending) setCancelling(null);
          }}
          onConfirm={(reason) => cancel.mutate({ item: cancelling, checkInId: cancelling.checkIn!.checkInId, reason })}
        />
      ) : null}
    </OperatorShell>
  );
}

function RosterRow({
  item,
  disabled,
  busy,
  onCheckIn,
  onCancel,
}: {
  item: RosterItem;
  disabled: boolean;
  busy: boolean;
  onCheckIn: () => void;
  onCancel: () => void;
}) {
  const done = item.checkIn?.status === "CHECKED_IN";
  const wasCancelled = item.checkIn?.status === "CANCELLED";
  const meta = [item.cohort, item.phoneLast4 ? `끝자리 ${item.phoneLast4}` : null].filter(Boolean).join(" · ");
  const labelId = useId();
  return (
    <li className="event-field__row" aria-labelledby={labelId}>
      <div className="event-field__row-main">
        <p className="event-field__name" id={labelId}>
          {item.name}
        </p>
        {meta ? <p className="event-field__meta">{meta}</p> : null}
        {done && item.checkIn ? (
          <p className="event-field__meta">
            {formatSubmittedAt(item.checkIn.checkedInAt)}
            {item.checkIn.checkedInByDisplayName ? ` · ${item.checkIn.checkedInByDisplayName}` : ""}
            {item.checkIn.method === "QR" ? " · QR" : ""}
          </p>
        ) : null}
        {wasCancelled ? <p className="event-field__meta">체크인을 취소했어요</p> : null}
      </div>
      <span className={done ? "event-field__badge event-field__badge--done" : "event-field__badge"}>
        {done ? "체크인 완료" : "미완료"}
      </span>
      <div className="event-field__row-action">
        {done ? (
          <Button
            type="button"
            variant="danger-outline"
            size={48}
            disabled={disabled}
            aria-describedby={disabled ? "field-blocked" : undefined}
            aria-label={`${item.name} 체크인 취소`}
            onClick={onCancel}
          >
            체크인 취소
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size={48}
            disabled={disabled}
            loading={busy}
            aria-describedby={disabled ? "field-blocked" : undefined}
            aria-label={`${item.name} 체크인`}
            onClick={onCheckIn}
          >
            체크인
          </Button>
        )}
      </div>
    </li>
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
      title={`${item.name} 님의 체크인을 취소할까요?`}
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

function blockedReason(status: LifecycleStatus, mayWrite: boolean, permissionsPending: boolean): string | null {
  if (status === "DRAFT") return "행사를 시작하면 체크인할 수 있어요. 지금은 명단만 볼 수 있어요.";
  if (status === "ENDED") return "종료된 행사라 체크인과 취소를 할 수 없어요.";
  if (status === "ARCHIVED") return "보관된 행사라 체크인과 취소를 할 수 없어요.";
  if (permissionsPending) return null;
  if (!mayWrite) return "체크인 권한이 없어 명단만 볼 수 있어요. 행사 OWNER에게 권한을 요청해 주세요.";
  return null;
}

function checkInNotice(result: CheckInResult): Notice {
  const name = result.participant.name;
  if (result.result === "ALREADY_CHECKED_IN") {
    const by = result.checkIn.checkedInByDisplayName ? ` · ${result.checkIn.checkedInByDisplayName}` : "";
    return { tone: "info", text: `${name} 님은 이미 체크인했어요 (${formatSubmittedAt(result.checkIn.checkedInAt)}${by}).` };
  }
  return { tone: "success", text: `${name} 님을 체크인했어요.` };
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
  if (isApiError(error, "NETWORK_ERROR")) return "연결이 불안정해요. 연결을 확인하고 다시 눌러 주세요.";
  return "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function emptyCopy(q: string, filter: Filter): string {
  if (q) return `'${q}'에 맞는 참가자가 없어요.`;
  if (filter === "pending") return "체크인하지 않은 참가자가 없어요.";
  if (filter === "done") return "아직 체크인한 참가자가 없어요.";
  return "신청을 마친 참가자가 아직 없어요.";
}
