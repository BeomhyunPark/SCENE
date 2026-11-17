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
import {
  CANCEL_REASON_MAX,
  getCheckInSummary,
  listAllCheckInRoster,
  listCheckInRoster,
  ROSTER_QUERY_MAX,
  type CancelResult,
  type CheckInResult,
  type RosterItem,
} from "../api/checkIns";
import { isApiError } from "../api/errors";
import type { EventDetail, LifecycleStatus } from "../api/events";
import { getPublishedGroups, type PublishedGroups } from "../api/groups";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { FieldScan } from "./EventFieldScan";
import { buildGroupStats, pendingFor, publishedGroupNames } from "./fieldGroupStats";
import { FieldGroups } from "./FieldGroups";
import { FieldRosterRow } from "./FieldRosterRow";
import { EventScreen } from "./EventScreen";
import { formatSubmittedAt } from "./eventFormat";
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
import "./EventField.css";

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 250;

type Filter = "all" | "pending" | "done";
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
 * Copy is a draft.
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

        {!queue.online ? (
          <p className="event-field__offline" role="status">
            오프라인이에요. 연결되면 확인 안 된 요청을 다시 보내고 현황을 새로 불러올게요.
          </p>
        ) : null}

        {queue.pending.length > 0 ? (
          <PendingList pending={queue.pending} online={queue.online} onRetry={retry} />
        ) : null}

        {scanOpen ? (
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

        <div className="event-field__filters event-field__views" role="group" aria-label="현황 보기">
          {(
            [
              ["all", "전체"],
              ["groups", "조별"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="event-field__filter"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "all" ? (
          <>
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
          </>
        ) : null}

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

        {view === "groups" ? (
          <GroupsSection
            published={published}
            rosterAll={rosterAll}
            pendingByTarget={pendingByTarget}
            disabled={Boolean(blocked)}
            onCheckIn={checkIn}
            onCancel={setCancelling}
            onRetry={retry}
          />
        ) : (
          <>
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
                      />
                    );
                  })}
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
          </>
        )}
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
      text: `${name} 님은 이미 체크인했어요 (${formatSubmittedAt(result.checkIn.checkedInAt)}${by}).`,
    };
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
  return "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function emptyCopy(q: string, filter: Filter): string {
  if (q) return `'${q}'에 맞는 참가자가 없어요.`;
  if (filter === "pending") return "체크인하지 않은 참가자가 없어요.";
  if (filter === "done") return "아직 체크인한 참가자가 없어요.";
  return "신청을 마친 참가자가 아직 없어요.";
}
