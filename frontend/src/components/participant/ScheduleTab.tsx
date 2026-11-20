import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { markScheduleNotificationsRead, type ParticipantRemovedItem, type ParticipantScheduleItem } from "../../api/participantSchedule";
import { queryKeys } from "../../api/queryKeys";
import type { ScheduleDay } from "../../api/schedule";
import { formatPublishedAt } from "../eventFormat";
import { EmptyNote } from "./HomeCard";
import { serverNow, useParticipantFeed } from "./participantFeed";
import { initialDay, scheduleNowNext } from "./scheduleNow";
import { useParticipantScheduleQuery, useScheduleClock } from "./scheduleQuery";
import { previousLines, timeRange } from "./scheduleView";
import "./ParticipantSchedule.css";

const NO_ITEMS: ParticipantScheduleItem[] = [];
const NO_DAYS: ScheduleDay[] = [];

type Row = { kind: "item"; item: ParticipantScheduleItem } | { kind: "removed"; item: ParticipantRemovedItem };

/**
 * 일정 tab (`/participate/{eventId}/schedule`, C5, schedule-contract §8). Day tabs open on today when it is
 * inside the event period. Items are in schedule order with times as sent (event local time); 지금·다음
 * are marked from the corrected clock. "변경됨"·"새 일정" with the previous values and "취소됨" lines come
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
  const now = useScheduleClock(items, days);
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

  const day = picked ?? initialDay(days, serverNow(feed), data?.timeZone);
  const rows = useMemo<Row[]>(() => {
    if (day === null) return [];
    // Items keep server order; a cancelled line goes before the first item that starts later.
    const list: Row[] = items.filter((item) => item.day === day).map((item) => ({ kind: "item" as const, item }));
    const removed = (data?.removedItems ?? []).filter((item) => item.day === day);
    for (const item of removed) {
      const at = list.findIndex((row) => row.item.startTime > item.startTime);
      list.splice(at === -1 ? list.length : at, 0, { kind: "removed", item });
    }
    return list;
  }, [items, data?.removedItems, day]);
  const nowNext = scheduleNowNext(items, now, days);
  const nowId = nowNext.phase === "during" ? nowNext.now?.itemId : undefined;
  const nextId = nowNext.phase === "during" || nowNext.phase === "before" ? nowNext.next?.itemId : undefined;

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
        {days.length > 1 ? (
          <div className="participant-schedule__days" role="tablist" aria-label="일차">
            {days.map((entry) => (
              <button
                key={entry.day}
                type="button"
                role="tab"
                aria-selected={entry.day === day}
                className={`participant-schedule__day${entry.day === day ? " participant-schedule__day--current" : ""}`}
                onClick={() => setPicked(entry.day)}
              >
                <span>{entry.day}일차</span>
                <span className="participant-schedule__day-date">{entry.dayLabel}</span>
              </button>
            ))}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <EmptyNote>이날은 일정이 없어요.</EmptyNote>
        ) : (
          <ol className="participant-schedule__list" aria-label={days.find((entry) => entry.day === day)?.dayLabel ?? "일정"}>
            {rows.map((row) =>
              row.kind === "removed" ? (
                <li key={`removed-${row.item.itemId}`} className="participant-schedule__item participant-schedule__item--removed">
                  <span className="participant-schedule__time">
                    <s>{row.item.startTime}</s>
                  </span>
                  <div className="participant-schedule__main">
                    <p className="participant-schedule__title">
                      <s>{row.item.title}</s>
                      <span className="participant-schedule__badge participant-schedule__badge--removed">취소됨</span>
                    </p>
                  </div>
                </li>
              ) : (
                <ItemRow key={row.item.itemId} item={row.item} days={days} now={row.item.itemId === nowId} next={row.item.itemId === nextId} />
              ),
            )}
          </ol>
        )}
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
  const classes = ["participant-schedule__item"];
  if (now) classes.push("participant-schedule__item--now");
  if (item.change) classes.push("participant-schedule__item--changed");
  return (
    <li className={classes.join(" ")} aria-current={now ? "time" : undefined}>
      <span className="participant-schedule__time">{timeRange(item)}</span>
      <div className="participant-schedule__main">
        <p className="participant-schedule__title">
          {item.title}
          {now ? <span className="participant-schedule__badge participant-schedule__badge--now">지금</span> : null}
          {next ? <span className="participant-schedule__badge participant-schedule__badge--next">다음</span> : null}
          {item.change ? (
            <span className="participant-schedule__badge participant-schedule__badge--changed">{item.change.kind === "ADDED" ? "새 일정" : "변경됨"}</span>
          ) : null}
          {item.leadersOnly ? <span className="participant-schedule__badge">조장</span> : null}
        </p>
        {item.place ? <p className="participant-schedule__place">{item.place}</p> : null}
        {lines.length > 0 ? (
          <ul className="participant-schedule__previous" aria-label="바뀐 내용">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {item.description ? <p className="participant-schedule__description">{item.description}</p> : null}
      </div>
    </li>
  );
}
