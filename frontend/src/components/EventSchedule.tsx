import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import {
  AUDIENCE_LABEL,
  conflictReason,
  outOfPeriodIdsOf,
  publishSchedule,
  type ScheduleBoard,
  type ScheduleItem,
} from "../api/schedule";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { eventContext, formatPublishedAt } from "./eventFormat";
import { readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import { categoryLabel, commonFailure, itemTime, publishedText, useScheduleBoard, useScheduleWrite, writeBlocked } from "./scheduleAccess";
import { initialDay, scheduleNowNext } from "./participant/scheduleNow";
import { Timetable, type TimetableColumn } from "./Timetable";
import { useWideTimetable } from "./useWideTimetable";
import { isPast, nowLineMinute, nowOnDay, zonedClock } from "./timetable";
import { useMinuteClock } from "./useMinuteClock";
import "./EventGroups.css";
import "./EventSchedule.css";

export type ScheduleNotice = { tone: "success" | "info" | "error"; text: string };

/**
 * 일정표 (C4, DEC-081, #466). A timetable: hour labels on the left and each item as long as it lasts. On an
 * event day a line marks the current time (event time zone) with 지금·다음 on the items, and finished
 * items go quiet. Phones show one day under day tabs; wide screens show every day side by side. One 공개
 * button for the whole board. Each item opens its editor, where "저장하고 바로 공개" is one
 * request. The board is the working copy; participants see only what is published.
 */
export function EventSchedule() {
  const { eventId = "" } = useParams();
  return <EventScreen eventId={eventId}>{(event, spaceName) => <ScheduleFrame event={event} spaceName={spaceName} />}</EventScreen>;
}

/** The operator frame shared with the item editor. */
export function ScheduleShell({
  event,
  spaceName,
  back,
  board = false,
  children,
}: {
  event: EventDetail;
  spaceName?: string;
  back: string;
  /** The timetable itself, which may use the full width on desktop. */
  board?: boolean;
  children: ReactNode;
}) {
  const eventHref = `/events/${event.eventId}`;
  return (
    <OperatorShell
      title={event.name}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={readEventAreas(event.eventId)}
      participantsHref={`${eventHref}/participants`}
      tasksHref={`${eventHref}/tasks`}
      framed
      leading={
        <Link className="event-home__back" to={back} aria-label={back === eventHref ? "행사 홈으로" : "일정표로"}>
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className={`event-schedule${board ? " event-schedule--board" : ""}`}>{children}</div>
    </OperatorShell>
  );
}

function ScheduleFrame({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const board = useScheduleBoard(event.eventId);
  const context = [eventContext(event), spaceName ?? ""].filter((part) => part.length > 0).join(" · ");
  return (
    <ScheduleShell event={event} spaceName={spaceName} back={`/events/${event.eventId}`} board>
      {board.data ? (
        <Board eventId={event.eventId} context={context} board={board.data} fetching={board.isFetching} />
      ) : (
        <>
          <Head context={context} />
          {isApiError(board.error) && board.error.status === 403 ? (
            <p className="event-groups__blocked" role="note">
              일정표를 볼 권한이 없어요.
            </p>
          ) : board.isError ? (
            <div className="event-groups__inline-error">
              <p>일정표를 불러오지 못했어요.</p>
              <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(board)}>
                다시 시도
              </Button>
            </div>
          ) : (
            <p className="event-groups__muted">일정표를 불러오는 중이에요.</p>
          )}
        </>
      )}
    </ScheduleShell>
  );
}

function Head({ context, actions }: { context: string; actions?: ReactNode }) {
  return (
    <section className="event-schedule__head" aria-label="일정표 현황">
      <div>
        <h2 className="event-groups__title">일정표</h2>
        {context ? <p className="event-groups__context">{context}</p> : null}
      </div>
      {actions ? <div className="event-schedule__head-actions">{actions}</div> : null}
    </section>
  );
}

type Publishing = { stale: boolean; notify: boolean };

function Board({ eventId, context, board, fetching }: { eventId: string; context: string; board: ScheduleBoard; fetching: boolean }) {
  const eventHref = `/events/${eventId}`;
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { mayWrite, pending } = useScheduleWrite(eventId);
  const blocked = writeBlocked(board, mayWrite, pending);
  const editable = blocked === null && !pending;
  const noPeriod = board.days.length === 0;
  const arrived = (location.state as { notice?: ScheduleNotice } | null)?.notice ?? null;
  const [notice, setNotice] = useState<ScheduleNotice | null>(arrived);
  const [publishing, setPublishing] = useState<Publishing | null>(null);
  const [busy, setBusy] = useState(false);
  const [outside, setOutside] = useState<string[]>([]);

  const now = useMinuteClock();
  const wideScreen = useWideTimetable();
  // 행사 전체 / 하루 보기 (SCENE 시간표 frame 172:3): every day side by side on wide screens, or one day.
  const [allDays, setAllDays] = useState(true);
  const wide = wideScreen && allDays && board.days.length > 1;
  const inPeriod = board.items.filter((item) => !item.outOfPeriod);
  const nowNext = scheduleNowNext(inPeriod, now, board.days);
  const nowItem = nowNext.phase === "during" ? nowNext.now : null;
  const nextItem = nowNext.phase === "during" ? nowNext.next : null;
  const wanted = Number(params.get("day"));
  // Opens on the day of what is running now (an overnight item keeps yesterday), else today, else day 1.
  const day = board.days.some((entry) => entry.day === wanted) ? wanted : (nowItem?.day ?? initialDay(board.days, now, board.timeZone) ?? 1);
  const dayItems = inPeriod.filter((item) => item.day === day);
  // 오늘 (the calendar frames' Today): back to today's day and the current-time line, while the event is on.
  const todayDay = nowItem?.day ?? board.days.find((entry) => entry.date === zonedClock(now, board.timeZone).date)?.day ?? null;
  const [jumps, setJumps] = useState(0);
  function goToday() {
    if (todayDay === null) return;
    if (!wide) setParams({ day: String(todayDay) }, { replace: true });
    setJumps((count) => count + 1);
  }
  const outOfPeriod = board.items.filter((item) => item.outOfPeriod || outside.includes(item.itemId));
  const { pendingChanges, lastPublishedAt, lastPublishedByDisplayName } = board.publication;
  const pendingCount = pendingChanges.added + pendingChanges.changed + pendingChanges.removed;
  const firstPublish = lastPublishedAt === null;

  function reload() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.scheduleBoard(eventId) });
  }

  async function publish() {
    if (!publishing) return;
    setBusy(true);
    try {
      const result = await publishSchedule(eventId, board.boardVersion, publishing.notify);
      setPublishing(null);
      setOutside([]);
      setNotice({
        tone: result.result === "PUBLISHED" ? "success" : "info",
        text: result.result === "PUBLISHED" ? publishedText(result, publishing.notify, "공개했어요.") : "이미 공개된 내용과 같아요. 바뀐 것이 없어요.",
      });
    } catch (error) {
      if (isApiError(error, "CONCURRENT_MODIFICATION")) {
        // Show the newest board in the same dialog and ask again.
        setPublishing({ ...publishing, stale: true });
      } else {
        setPublishing(null);
        const reason = conflictReason(error);
        if (reason === "ITEMS_OUT_OF_PERIOD") {
          setOutside(outOfPeriodIdsOf(error));
          setNotice({ tone: "error", text: "행사 기간 밖의 일정이 있어 공개하지 않았어요. 위에 표시한 일정을 옮기거나 지워 주세요." });
        } else if (reason === "EVENT_PERIOD_REQUIRED") {
          setNotice({ tone: "error", text: "행사 기간이 없어 공개할 수 없어요. 행사 설정에서 기간을 정해 주세요." });
        } else {
          setNotice({ tone: "error", text: commonFailure(error) ?? "공개하지 못했어요. 다시 시도해 주세요." });
        }
      }
    } finally {
      setBusy(false);
      void reload();
    }
  }

  const addHref = `${eventHref}/schedule/new?day=${day}`;
  return (
    <>
      <Head
        context={context}
        actions={
          editable && !noPeriod ? (
            <>
              <Link className="scene-button scene-button--secondary scene-button--size-40 event-schedule__add" to={addHref}>
                <span className="scene-button__label">+ 일정 추가</span>
              </Link>
              <Button type="button" variant="primary" size={40} disabled={busy} onClick={() => setPublishing({ stale: false, notify: true })}>
                공개
              </Button>
            </>
          ) : null
        }
      />
      <p className="event-schedule__status">
        <span>
          {firstPublish
            ? "아직 공개하지 않았어요"
            : `마지막 공개 ${formatPublishedAt(lastPublishedAt)}${lastPublishedByDisplayName ? ` · ${lastPublishedByDisplayName}` : ""}`}
        </span>
        <span className={pendingCount > 0 || firstPublish ? "event-schedule__pending" : undefined}>
          {pendingCount > 0
            ? `공개하지 않은 변경 ${pendingCount}건 (추가 ${pendingChanges.added} · 변경 ${pendingChanges.changed} · 삭제 ${pendingChanges.removed})`
            : firstPublish
              ? "공개하면 참가자 일정 탭에 보여요"
              : "모두 공개됐어요"}
        </span>
        {fetching ? <span className="event-groups__fetching">새로 읽는 중</span> : null}
      </p>
      {notice ? (
        <p className={`event-groups__notice event-groups__notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      {blocked ? (
        <p className="event-groups__blocked" role="note">
          {blocked}
        </p>
      ) : null}
      {noPeriod ? (
        <div className="event-groups__blocked" role="note">
          <p className="event-schedule__plain">행사 기간이 없어 일정을 만들 수 없어요. 행사 설정에서 시작일과 끝나는 날을 정해 주세요.</p>
          <Link className="event-schedule__link" to={`${eventHref}/settings`}>
            행사 설정으로 가기
          </Link>
        </div>
      ) : null}
      {outOfPeriod.length > 0 ? (
        <section className="event-schedule__outside" aria-label="행사 기간 밖 일정">
          <h3>행사 기간 밖 일정 {outOfPeriod.length}건</h3>
          <p className="event-groups__muted">기간이 줄어 밖에 남은 일정이에요. 일차를 옮기거나 지워야 공개할 수 있어요.</p>
          <ItemList items={outOfPeriod} board={board} eventHref={eventHref} editable={editable} />
        </section>
      ) : null}
      {todayDay !== null || (wideScreen && board.days.length > 1) ? (
        <div className="event-schedule__views">
          {todayDay !== null ? (
            <Button type="button" variant="secondary" size={32} onClick={goToday}>
              오늘
            </Button>
          ) : null}
          {wideScreen && board.days.length > 1 ? (
            <div className="event-schedule__view-switch" role="group" aria-label="보기">
              <Button type="button" variant={allDays ? "primary" : "secondary"} size={32} aria-pressed={allDays} onClick={() => setAllDays(true)}>
                행사 전체
              </Button>
              <Button type="button" variant={allDays ? "secondary" : "primary"} size={32} aria-pressed={!allDays} onClick={() => setAllDays(false)}>
                하루 보기
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {board.days.length > 0 && !wide ? (
        <div className="event-schedule__days" role="tablist" aria-label="일차">
          {board.days.map((entry) => {
            const count = board.items.filter((item) => item.day === entry.day && !item.outOfPeriod).length;
            return (
              <button
                key={entry.day}
                type="button"
                role="tab"
                aria-selected={entry.day === day}
                className={`event-schedule__day${entry.day === day ? " event-schedule__day--current" : ""}`}
                onClick={() => setParams({ day: String(entry.day) }, { replace: true })}
              >
                <span>
                  {entry.day}일차 <span className="event-schedule__day-count">{count}</span>
                </span>
                <span className="event-schedule__day-date">{entry.dayLabel}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {board.days.length > 0 ? (
        (wide ? inPeriod.length === 0 : dayItems.length === 0) ? (
          <div className="event-schedule__empty">
            <p>이날은 일정이 없어요.</p>
            {editable ? (
              <Button type="button" variant="secondary" size={40} onClick={() => navigate(addHref)}>
                + 일정 추가
              </Button>
            ) : null}
          </div>
        ) : (
          <BoardTimetable
            board={board}
            items={inPeriod}
            days={wide ? board.days : board.days.filter((entry) => entry.day === day)}
            now={now}
            nowId={nowItem?.itemId}
            nextId={nextItem?.itemId}
            eventHref={eventHref}
            editable={editable}
            scrollKey={`${wide ? "all" : day}:${jumps}`}
          />
        )
      ) : null}
      {publishing ? (
        <PublishDialog
          board={board}
          publishing={publishing}
          busy={busy}
          onNotify={(notify) => setPublishing({ ...publishing, notify })}
          onClose={() => setPublishing(null)}
          onPublish={() => void publish()}
        />
      ) : null}
    </>
  );
}

function ItemList({ items, board, eventHref, editable, label }: { items: ScheduleItem[]; board: ScheduleBoard; eventHref: string; editable: boolean; label?: string }) {
  return (
    <ol className="event-schedule__list" aria-label={label ?? "일정"}>
      {items.map((item) => {
        const body = <ItemSummary item={item} board={board} />;
        return (
          <li key={item.itemId} className={`event-schedule__item${item.publishState === "UNCHANGED" ? "" : " event-schedule__item--pending"}`}>
            {editable ? (
              <Link className="event-schedule__row" to={`${eventHref}/schedule/${item.itemId}`} aria-label={`${item.startTime} ${item.title} 고치기`}>
                {body}
              </Link>
            ) : (
              <div className="event-schedule__row">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function BoardTimetable({
  board,
  items,
  days,
  now,
  nowId,
  nextId,
  eventHref,
  editable,
  scrollKey,
}: {
  board: ScheduleBoard;
  items: ScheduleItem[];
  days: ScheduleBoard["days"];
  now: number;
  nowId?: string;
  nextId?: string;
  eventHref: string;
  editable: boolean;
  scrollKey: string;
}) {
  const columns: TimetableColumn<ScheduleItem>[] = days.map((entry) => {
    const rows = items.filter((item) => item.day === entry.day);
    return {
      key: String(entry.day),
      label: entry.dayLabel,
      rows,
      nowMinute: nowLineMinute(entry.date, rows, now, board.timeZone),
      header: (
        <>
          <span>
            {entry.dayLabel} · {entry.day}일차
          </span>
          <span className="event-schedule__column-count">{rows.length}개 일정</span>
        </>
      ),
    };
  });
  // Finished items go quiet only while the event is on (some day has the current-time line).
  const live = board.days.some((entry) => nowLineMinute(entry.date, items.filter((item) => item.day === entry.day), now, board.timeZone) !== null);
  return (
    <Timetable
      columns={columns}
      scrollKey={scrollKey}
      block={(placed, column) => {
        const item = placed.row;
        const date = days.find((entry) => String(entry.day) === column.key)?.date ?? "";
        const classes = ["event-schedule__block"];
        if (item.itemId === nowId) classes.push("event-schedule__block--now");
        else if (live && isPast(placed, nowOnDay(date, now, board.timeZone))) classes.push("event-schedule__block--past");
        if (item.publishState !== "UNCHANGED") classes.push("event-schedule__block--pending");
        const body = <ItemSummary item={item} board={board} now={item.itemId === nowId} next={item.itemId === nextId} />;
        return {
          key: item.itemId,
          className: classes.join(" "),
          current: item.itemId === nowId,
          content: editable ? (
            <Link className="event-schedule__row" to={`${eventHref}/schedule/${item.itemId}`} aria-label={`${item.startTime} ${item.title} 고치기`}>
              {body}
            </Link>
          ) : (
            <div className="event-schedule__row">{body}</div>
          ),
        };
      }}
    />
  );
}

function ItemSummary({ item, board, now = false, next = false }: { item: ScheduleItem; board: ScheduleBoard; now?: boolean; next?: boolean }) {
  const slot = item.slotId ? (board.slots?.find((entry) => entry.slotId === item.slotId) ?? null) : null;
  return (
    <>
      <span className="event-schedule__when">
        <span className="event-schedule__time">{itemTime(item)}</span>
        {now ? <span className="event-schedule__tag event-schedule__tag--now">지금</span> : null}
        {next ? <span className="event-schedule__tag event-schedule__tag--next">다음</span> : null}
      </span>
      <span className="event-schedule__main">
        <span className="event-schedule__title">{item.title}</span>
        {item.place ? <span className="event-schedule__place">{item.place}</span> : null}
        <span className="event-schedule__tags">
          <span className="event-schedule__tag">{categoryLabel(item)}</span>
          {item.audience !== "ALL" ? <span className="event-schedule__tag event-schedule__tag--audience">{AUDIENCE_LABEL[item.audience]}만</span> : null}
          {item.slotId ? <span className="event-schedule__tag">{slot ? `${slot.label} 칸` : "신청서에 없는 칸"}</span> : null}
          {item.publishState === "ADDED" ? <span className="event-schedule__tag event-schedule__tag--pending">새 항목 · 공개 안 됨</span> : null}
          {item.publishState === "CHANGED" ? <span className="event-schedule__tag event-schedule__tag--pending">바뀜 · 공개 안 됨</span> : null}
          {item.outOfPeriod ? <span className="event-schedule__tag event-schedule__tag--error">기간 밖</span> : null}
        </span>
      </span>
    </>
  );
}

function PublishDialog({
  board,
  publishing,
  busy,
  onNotify,
  onClose,
  onPublish,
}: {
  board: ScheduleBoard;
  publishing: Publishing;
  busy: boolean;
  onNotify: (notify: boolean) => void;
  onClose: () => void;
  onPublish: () => void;
}) {
  const added = board.items.filter((item) => item.publishState === "ADDED");
  const changed = board.items.filter((item) => item.publishState === "CHANGED");
  const { removed } = board.publication.pendingChanges;
  const first = board.publication.lastPublishedAt === null;
  const nothing = !first && added.length + changed.length + removed === 0;
  return (
    <ConfirmDialog
      title="일정표를 공개할까요?"
      scroll
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="tertiary" size={40} onClick={onClose}>
            취소
          </Button>
          <Button type="button" variant="primary" size={40} disabled={busy} onClick={onPublish}>
            {busy ? "공개하는 중" : "공개"}
          </Button>
        </>
      }
    >
      {publishing.stale ? (
        <p className="event-groups__notice event-groups__notice--info" role="status">
          그사이 일정표가 바뀌었어요. 최신 내용으로 다시 확인해 주세요.
        </p>
      ) : null}
      {first ? <p>처음 공개하면 참가자 일정 탭과 홈에 일정표가 보여요.</p> : null}
      {nothing ? <p>공개된 내용과 같아요. 바뀐 것이 없어요.</p> : null}
      <ChangeGroup title={`새 일정 ${added.length}건`} titles={added.map((item) => `${item.startTime} ${item.title}`)} />
      <ChangeGroup title={`바뀐 일정 ${changed.length}건`} titles={changed.map((item) => `${item.startTime} ${item.title}`)} />
      {removed > 0 ? <p>지운 일정 {removed}건은 참가자 화면에 "취소됨"으로 하루 동안 보여요.</p> : null}
      <label className="event-schedule__check">
        <input type="checkbox" checked={publishing.notify} onChange={(event) => onNotify(event.target.checked)} />
        <span>
          참가자에게 알림 보내기
          <span className="event-schedule__hint">오타 수정처럼 알릴 필요가 없으면 꺼 주세요. 꺼도 일정표는 바로 바뀌어요.</span>
        </span>
      </label>
    </ConfirmDialog>
  );
}

export function ChangeGroup({ title, titles }: { title: string; titles: string[] }) {
  if (titles.length === 0) return null;
  return (
    <div className="event-schedule__changes">
      <p className="event-schedule__changes-title">{title}</p>
      <ul>
        {titles.map((text, index) => (
          <li key={`${index}-${text}`}>{text}</li>
        ))}
      </ul>
    </div>
  );
}
