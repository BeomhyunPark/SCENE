import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { markScheduleNotificationsRead, type ParticipantRemovedItem, type ParticipantScheduleItem } from "../../api/participantSchedule";
import { queryKeys } from "../../api/queryKeys";
import type { ScheduleDay } from "../../api/schedule";
import { formatPublishedAt } from "../eventFormat";
import { EmptyNote } from "./HomeCard";
import { Timetable, type TimetableColumn } from "../Timetable";
import { isPast, nowLineMinute, nowOnDay, zonedClock } from "../timetable";
import { useMinuteClock } from "../useMinuteClock";
import { useParticipantFeed } from "./participantFeed";
import { initialDay, scheduleNowNext } from "./scheduleNow";
import { useParticipantScheduleQuery } from "./scheduleQuery";
import { previousLines, timeRange } from "./scheduleView";
import "./ParticipantSchedule.css";

const NO_ITEMS: ParticipantScheduleItem[] = [];
const NO_DAYS: ScheduleDay[] = [];

type Timed = { startTime: string; endTime: string | null; endsNextDay: boolean };
type Row = ({ kind: "item"; item: ParticipantScheduleItem } | { kind: "removed"; item: ParticipantRemovedItem }) & Timed;

/**
 * 일정 tab (`/participate/{eventId}/schedule`, C5, schedule-contract §8, #466). Day tabs open on today when
 * it is inside the event period. The day is a timetable with times as sent (event local time): on an event
 * day a line marks the current time from the corrected clock, 지금·다음 are marked and finished items go
 * quiet. "변경됨"·"새 일정" with the previous values and "취소됨" lines come
 * from the server, which already dropped marks older than 24 hours. Opening the tab marks schedule
 * notifications read. Title, place and description are plain text.
 */
export function ScheduleTab() {
  const feed = useParticipantFeed();
  const { eventId } = feed;
  const query = useParticipantScheduleQuery(eventId);
  const data = query.data;
  const items = data?.items ?? NO_ITEMS;
  const days = data?.days ?? NO_DAYS;
  const now = useMinuteClock(feed.poll.serverOffsetMs);
  const [picked, setPicked] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const publishedAt = data?.publishedAt ?? null;
  const loaded = data !== undefined;

  // Once the schedule is on screen, and again after each new publication seen here.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    markScheduleNotificationsRead()
      .then(() => {
        if (!cancelled) void queryClient.invalidateQueries({ queryKey: queryKeys.participantNotifications(eventId) });
      })
      .catch(() => {
        // Read marks are a convenience; the bell (B5) reads its own count.
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, loaded, publishedAt, queryClient]);

  const nowNext = scheduleNowNext(items, now, days);
  const nowId = nowNext.phase === "during" ? nowNext.now?.itemId : undefined;
  const nextId = nowNext.phase === "during" || nowNext.phase === "before" ? nowNext.next?.itemId : undefined;
  // What is running now keeps its day (an overnight item stays on yesterday), else today, else day 1.
  const running = nowNext.phase === "during" ? nowNext.now : null;
  const day = picked ?? running?.day ?? initialDay(days, now, data?.timeZone);
  const rows = useMemo<Row[]>(() => {
    if (day === null) return [];
    // A cancelled item keeps its start; it has no end, so its block stops at the next start (or an hour).
    const list: Row[] = items.filter((item) => item.day === day).map((item) => ({ kind: "item" as const, item, startTime: item.startTime, endTime: item.endTime, endsNextDay: item.endsNextDay }));
    for (const item of (data?.removedItems ?? []).filter((entry) => entry.day === day)) {
      list.push({ kind: "removed", item, startTime: item.startTime, endTime: null, endsNextDay: false });
    }
    return list;
  }, [items, data?.removedItems, day]);
  const timeZone = data?.timeZone ?? "Asia/Seoul";
  const todayDay = running?.day ?? days.find((entry) => entry.date === zonedClock(now, timeZone).date)?.day ?? null;
  const [jumps, setJumps] = useState(0);
  const date = days.find((entry) => entry.day === day)?.date ?? null;
  const live = days.some((entry) => nowLineMinute(entry.date, items.filter((item) => item.day === entry.day), now, timeZone) !== null);
  const columns: TimetableColumn<Row>[] =
    date === null
      ? []
      : [
          {
            key: String(day),
            label: days.find((entry) => entry.day === day)?.dayLabel ?? "일정",
            rows,
            nowMinute: nowLineMinute(date, rows.filter((row) => row.kind === "item"), now, timeZone),
            header: (
              <>
                <span>{days.find((entry) => entry.day === day)?.dayLabel}</span>
                <span className="participant-schedule__count">{rows.filter((row) => row.kind === "item").length}개 일정</span>
              </>
            ),
          },
        ];

  let body;
  if (!data) {
    body = <EmptyNote>{query.isError ? "일정을 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요." : "불러오는 중이에요."}</EmptyNote>;
  } else if (data.status === "NOT_ELIGIBLE") {
    body = <EmptyNote>신청한 사람만 일정을 볼 수 있어요.</EmptyNote>;
  } else if (data.status === "NOT_PUBLISHED") {
    body = <EmptyNote>아직 일정표가 올라오지 않았어요. 올라오면 여기에 보여요.</EmptyNote>;
  } else {
    body = (
      <>
        {todayDay !== null ? (
          <button
            type="button"
            className="participant-schedule__today scene-press scene-press--quiet"
            onClick={() => {
              setPicked(todayDay);
              setJumps((count) => count + 1);
            }}
          >
            오늘
          </button>
        ) : null}
        {days.length > 1 ? (
          <div className="participant-schedule__days" role="tablist" aria-label="일차">
            {days.map((entry) => (
              <button
                key={entry.day}
                type="button"
                role="tab"
                aria-selected={entry.day === day}
                className={`participant-schedule__day scene-press scene-press--quiet${entry.day === day ? " participant-schedule__day--current" : ""}`}
                onClick={() => setPicked(entry.day)}
              >
                <span>{entry.day}일차</span>
                <span className="participant-schedule__day-date">{entry.dayLabel}</span>
              </button>
            ))}
          </div>
        ) : null}
        {rows.length === 0 ? <EmptyNote>이날은 일정이 없어요.</EmptyNote> : null}
        {columns.length > 0 ? (
          <div className="participant-schedule__timetable">
            <Timetable
              columns={columns}
              scrollKey={`${day}:${jumps}`}
              block={(placed) => {
                const row = placed.row;
                const past = live && date !== null && isPast(placed, nowOnDay(date, now, timeZone));
                if (row.kind === "removed") {
                  return {
                    key: `removed-${row.item.itemId}`,
                    className: "participant-schedule__item participant-schedule__item--removed",
                    content: (
                      <div className="participant-schedule__block timetable__content" title={`${row.item.startTime} ${row.item.title} · 취소됨`}>
                        <span className="participant-schedule__time timetable__when">
                          <s>{row.item.startTime}</s>
                        </span>
                        <p className="participant-schedule__title timetable__title">
                          <s>{row.item.title}</s>
                          <span className="participant-schedule__badge participant-schedule__badge--removed">취소됨</span>
                        </p>
                      </div>
                    ),
                  };
                }
                const isNow = row.item.itemId === nowId;
                const classes = ["participant-schedule__item", "timetable__block--expandable"];
                if (isNow) classes.push("participant-schedule__item--now");
                else if (past) classes.push("participant-schedule__item--past");
                if (row.item.change) classes.push("participant-schedule__item--changed");
                return {
                  key: row.item.itemId,
                  className: classes.join(" "),
                  current: isNow,
                  content: <ItemRow item={row.item} days={days} now={isNow} next={row.item.itemId === nextId} />,
                };
              }}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section className="participant-tab" aria-labelledby="participant-schedule-title">
      <div className="participant-schedule__head">
        <h1 id="participant-schedule-title" className="participant-tab__title">
          일정
        </h1>
        {publishedAt ? <p className="participant-schedule__updated">마지막 갱신 {formatPublishedAt(publishedAt)}</p> : null}
        {query.isError && data ? (
          <p className="participant-card__failed" role="status">
            갱신 실패
          </p>
        ) : null}
      </div>
      {body}
    </section>
  );
}

function ItemRow({ item, days, now, next }: { item: ParticipantScheduleItem; days: ScheduleDay[]; now: boolean; next: boolean }) {
  const lines = previousLines(item, days);
  return (
    // Focusable so a tap opens the whole block (changes and the description) when it is short.
    // The title attribute keeps the whole time when a narrow block draws only part of it.
    <div className="participant-schedule__block timetable__content" tabIndex={0} title={[timeRange(item), item.title, item.place].filter(Boolean).join(" · ")}>
      <span className="participant-schedule__time timetable__when">
        {item.startTime}
        <span className="timetable__time-end">{timeRange(item).slice(item.startTime.length)}</span>
      </span>
      <div className="participant-schedule__main">
        <p className="participant-schedule__title timetable__title">
          <span className="participant-schedule__title-text">{item.title}</span>
          {now ? <span className="participant-schedule__badge participant-schedule__badge--now">지금</span> : null}
          {next ? <span className="participant-schedule__badge participant-schedule__badge--next">다음</span> : null}
          {item.change ? (
            <span className="participant-schedule__badge participant-schedule__badge--changed">{item.change.kind === "ADDED" ? "새 일정" : "변경됨"}</span>
          ) : null}
          {item.leadersOnly ? <span className="participant-schedule__badge">조장</span> : null}
        </p>
        {item.place ? <p className="participant-schedule__place timetable__place">{item.place}</p> : null}
        {lines.length > 0 ? (
          <ul className="participant-schedule__previous timetable__detail" aria-label="바뀐 내용">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {item.description ? <p className="participant-schedule__description timetable__detail">{item.description}</p> : null}
      </div>
    </div>
  );
}
