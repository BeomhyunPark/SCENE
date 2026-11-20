import { Link } from "react-router";
import type { ParticipantScheduleItem } from "../../../api/participantSchedule";
import { EmptyNote, HomeCard } from "../HomeCard";
import { useParticipantFeed } from "../participantFeed";
import { participantPath } from "../participantTabs";
import { scheduleNowNext } from "../scheduleNow";
import { useParticipantScheduleQuery, useScheduleClock } from "../scheduleQuery";
import { timeRange } from "../scheduleView";
import "../ParticipantSchedule.css";

const NO_ITEMS: ParticipantScheduleItem[] = [];

/**
 * 지금·다음 일정 (§1, §6). Same query as the 일정 tab (reloads on `updates.schedule` and `updates.group`).
 * Now and next are computed on the phone from `startsAt`·`endsAt` and the corrected clock, and move on
 * by themselves when an item starts or ends; the shown times are the event's local `HH:mm` as sent.
 */
export function NowNextCard() {
  const { eventId } = useParticipantFeed();
  const query = useParticipantScheduleQuery(eventId);
  const data = query.data;
  const items = data?.items ?? NO_ITEMS;
  const now = useScheduleClock(items, data?.days ?? NO_DAYS);
  const to = participantPath(eventId, "schedule");
  if (data?.status === "NOT_ELIGIBLE") return null;

  let body;
  if (!data) {
    body = <EmptyNote>{query.isError ? "일정을 불러오지 못했어요." : "불러오는 중이에요."}</EmptyNote>;
  } else if (data.status === "NOT_PUBLISHED") {
    body = <EmptyNote>일정이 올라오면 여기에 보여요.</EmptyNote>;
  } else {
    const result = scheduleNowNext(items, now, data.days);
    if (result.phase === "empty") body = <EmptyNote>아직 일정이 없어요.</EmptyNote>;
    else if (result.phase === "after") body = <EmptyNote>일정이 모두 끝났어요.</EmptyNote>;
    else if (result.phase === "before") body = <Row label="첫 일정" item={result.next} days={data.days} showDay />;
    else
      body = (
        <>
          {result.now ? <Row label="지금" item={result.now} days={data.days} current /> : null}
          {result.next ? (
            <Row label="다음" item={result.next} days={data.days} showDay={result.next.day !== (result.now ?? result.next).day || !result.now} />
          ) : (
            <p className="participant-card__meta">다음 일정은 없어요.</p>
          )}
        </>
      );
  }
  return (
    <HomeCard
      title="지금·다음 일정"
      failed={query.isError && Boolean(data)}
      action={
        <Link className="participant-card__link" to={to} aria-label="일정 전체 보기">
          전체 보기
        </Link>
      }
    >
      {body}
    </HomeCard>
  );
}

const NO_DAYS: [] = [];

function Row({
  label,
  item,
  days,
  current = false,
  showDay = false,
}: {
  label: string;
  item: ParticipantScheduleItem;
  days: { day: number; dayLabel: string }[];
  current?: boolean;
  showDay?: boolean;
}) {
  const day = showDay ? days.find((entry) => entry.day === item.day)?.dayLabel : undefined;
  return (
    <div className={`participant-nownext${current ? " participant-nownext--current" : ""}`}>
      <span className="participant-nownext__label">{label}</span>
      <div className="participant-nownext__body">
        <p className="participant-nownext__time">
          {day ? `${day} ` : ""}
          {timeRange(item)}
          {item.change ? <span className="participant-schedule__badge participant-schedule__badge--changed">{item.change.kind === "ADDED" ? "새 일정" : "변경됨"}</span> : null}
        </p>
        <p className="participant-nownext__title">{item.title}</p>
        {item.place ? <p className="participant-card__meta">{item.place}</p> : null}
      </div>
    </div>
  );
}
