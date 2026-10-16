import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import checklist from "../assets/event-home/checklist.svg";
import dateIcon from "../assets/event-home/date.svg";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import type { EventDetail } from "../api/events";
import { EventScreen } from "./EventScreen";
import { eventContext, lifecycleLabel } from "./eventFormat";
import "./EventHome.css";

const checks = [
  { title: "신청 기간", detail: "아직 정하지 않았어요", badge: "시작", action: "확인" },
  { title: "받을 정보", detail: "이름 · 연락처 · 참석 여부", badge: "선택", action: "3개" },
  { title: "완료 안내", detail: "신청 후 본인 정보 확인", badge: "선택", action: "사용" },
];

export function EventRegistrationSetup() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <SetupBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function SetupBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const title = event.name;
  const context = eventContext(event);
  const draftStatus = event.lifecycleStatus === "DRAFT";

  return (
    <OperatorShell
      title={title}
      spaceName={spaceName}
      eventName={title}
      eventHref={eventId ? `/events/${eventId}` : undefined}
      eventAreas={["participants"]}
      participantsHref={eventId ? `/events/${eventId}/participants` : undefined}
      framed
      leading={
        <Link className="event-home__back" to={eventId ? `/events/${eventId}/participants` : "/events"} aria-label="참가 운영">
          <img src={arrowLeft} alt="" />
        </Link>
      }
      action={
        <Button type="button" variant="secondary" size={40}>
          행사 설정
        </Button>
      }
    >
      <div className="event-home">
        <div className="event-home__context">
          <div>
            {context ? <p className="event-home__facts">{context}</p> : null}
            <p className="event-home__state">{draftStatus ? "새로 만든 행사" : lifecycleLabel(event.lifecycleStatus)}</p>
          </div>
          <span className="event-home__badge">설정 중</span>
        </div>
        <section className="event-home__welcome">
          <span className="event-home__mark" aria-hidden="true">
            <img src={calendarCheck} alt="" />
          </span>
          <div className="event-home__welcome-copy">
            <h2>참가 신청을 준비해 보세요.</h2>
            <p>신청 기간과 받을 정보를 확인해 주세요.</p>
          </div>
          <Button type="button" variant="primary" size={40}>
            신청 열기
          </Button>
        </section>
        <div className="event-home__work-intro">
          <h2>공개 전 확인</h2>
          <p>필요한 정보만 받도록 준비했어요.</p>
        </div>
        <div className="event-home__cards">
          {checks.map((item) => (
            <button key={item.title} className="event-home__card" type="button" aria-label={item.title}>
              <span className="event-home__chip">{item.badge}</span>
              <span className="event-home__card-title">{item.title}</span>
              <span className="event-home__card-meta">
                <span>
                  <img src={dateIcon} alt="" />
                  {item.detail}
                </span>
                <span>
                  <img src={checklist} alt="" />
                  {item.action}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="event-home__note">공개한 뒤에도 신청 기간과 안내를 바꿀 수 있어요.</p>
      </div>
    </OperatorShell>
  );
}
