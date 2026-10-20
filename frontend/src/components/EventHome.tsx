import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import checklist from "../assets/event-home/checklist.svg";
import dateIcon from "../assets/event-home/date.svg";
import type { EventDetail } from "../api/events";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { eventContext, lifecycleLabel } from "./eventFormat";
import { readEventAreas } from "./eventLocalState";
import "./EventHome.css";

const starts = [
  { title: "참가자 받기", detail: "신청 링크 또는 직접 추가", badge: "시작" },
  { title: "준비 업무", detail: "담당자와 마감 정리", badge: "선택" },
  { title: "일정 정리", detail: "필요한 일정만 기록", badge: "선택" },
];

export function EventHome() {
  const { eventId = "" } = useParams();
  const areas = readEventAreas(eventId);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => (
        <EventHomeBody event={event} spaceName={spaceName} areas={areas} />
      )}
    </EventScreen>
  );
}

function EventHomeBody({
  event,
  spaceName,
  areas,
}: {
  event: EventDetail;
  spaceName?: string;
  areas: string[];
}) {
  const navigate = useNavigate();
  const eventId = event.eventId;
  const title = event.name;
  const context = eventContext(event);
  const draftStatus = event.lifecycleStatus === "DRAFT";
  const closed = event.lifecycleStatus === "ENDED" || event.lifecycleStatus === "ARCHIVED";

  return (
    <OperatorShell
      title={title}
      spaceName={spaceName}
      eventName={title}
      eventHref={eventId ? `/events/${eventId}` : undefined}
      eventAreas={areas}
      participantsHref={eventId ? `/events/${eventId}/participants` : undefined}
      tasksHref={areas.includes("tasks") && eventId ? `/events/${eventId}/tasks` : undefined}
      framed
      leading={
        <Link className="event-home__back" to="/events" aria-label="행사 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
      action={
        <Button type="button" variant="secondary" size={40} onClick={() => navigate(`/events/${eventId}/settings`)}>
          행사 설정
        </Button>
      }
    >
      <div className="event-home">
        <div className="event-home__context">
          <div>
            {context ? <p className="event-home__facts">{context}</p> : null}
            <p className="event-home__state">{draftStatus ? "새로 만든 행사" : lifecycleLabel(event.lifecycleStatus)}</p>
            {draftStatus || closed ? null : (
              <Link className="event-home__retrospective" to={`/events/${eventId}/retrospective`}>
                회고
              </Link>
            )}
          </div>
          <span className="event-home__badge">{draftStatus ? "준비 시작" : lifecycleLabel(event.lifecycleStatus)}</span>
        </div>
        {closed ? (
          <section className="event-home__ended">
            <h2>{event.lifecycleStatus === "ARCHIVED" ? "보관된 행사예요" : "행사가 종료됐어요"}</h2>
            <p>
              {event.lifecycleStatus === "ARCHIVED"
                ? "읽을 수만 있어요."
                : "회고를 남길 수 있어요."}
            </p>
            <Button type="button" variant="primary" size={40} onClick={() => navigate(`/events/${eventId}/retrospective`)}>
              회고
            </Button>
          </section>
        ) : (
          <>
            <section className="event-home__welcome">
              <span className="event-home__mark" aria-hidden="true">
                <img src={calendarCheck} alt="" />
              </span>
              <div className="event-home__welcome-copy">
                <h2>필요한 업무부터 시작해 보세요.</h2>
                <p>작은 행사는 이대로 시작해도 괜찮아요.</p>
              </div>
              <Button type="button" variant="primary" size={40}>
                다른 운영 시작
              </Button>
            </section>
            <div className="event-home__work-intro">
              <h2>지금 시작할 일</h2>
              <p>필요한 것만 골라 시작해 보세요.</p>
            </div>
            <div className="event-home__cards">
              {starts.map((item) => (
                <button
                  key={item.title}
                  className="event-home__card"
                  type="button"
                  aria-label={item.title}
                  onClick={
                    item.title === "참가자 받기" && eventId
                      ? () => navigate(`/events/${eventId}/participants`)
                      : item.title === "준비 업무" && eventId
                        ? () => navigate(`/events/${eventId}/tasks`)
                        : undefined
                  }
                >
                  <span className="event-home__chip">{item.badge}</span>
                  <span className="event-home__card-title">{item.title}</span>
                  <span className="event-home__card-meta">
                    <span>
                      <img src={dateIcon} alt="" />
                      {item.detail}
                    </span>
                    <span>
                      <img src={checklist} alt="" />
                      시작
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="event-home__note">필요해지면 다른 운영을 시작할 수 있어요.</p>
          </>
        )}
      </div>
    </OperatorShell>
  );
}
