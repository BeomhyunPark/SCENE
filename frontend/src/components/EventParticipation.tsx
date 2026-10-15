import { useEffect } from "react";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import checklist from "../assets/event-home/checklist.svg";
import dateIcon from "../assets/event-home/date.svg";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { eventContext, markEventArea, readEventDraft } from "./eventDraft";
import "./EventHome.css";

const ways = [
  { title: "신청 링크 만들기", detail: "공유할 주소를 만들어요", badge: "시작", action: "준비" },
  { title: "QR로 공유하기", detail: "현장 · 인쇄물에 사용", badge: "선택", action: "준비" },
  { title: "참가자 직접 추가", detail: "운영자가 명단에 입력", badge: "선택", action: "추가" },
];

export function EventParticipation() {
  const { eventId = "" } = useParams();
  const draft = readEventDraft(eventId);
  const title = draft?.name || "행사";
  const context = draft ? eventContext(draft) : "";

  useEffect(() => {
    if (eventId) markEventArea(eventId, "participants");
  }, [eventId]);

  return (
    <OperatorShell
      title={title}
      eventName={title}
      eventHref={eventId ? `/events/${eventId}` : undefined}
      eventAreas={["participants"]}
      participantsHref={eventId ? `/events/${eventId}/participants` : undefined}
      framed
      leading={
        <Link className="event-home__back" to="/events" aria-label="행사 목록">
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
            <p className="event-home__state">참가 운영 · 시작 전</p>
          </div>
          <span className="event-home__badge">참가 운영</span>
        </div>
        <section className="event-home__welcome">
          <span className="event-home__mark" aria-hidden="true">
            <img src={calendarCheck} alt="" />
          </span>
          <div className="event-home__welcome-copy">
            <h2>아직 참가자가 없어요.</h2>
            <p>신청을 열거나 운영자가 직접 추가할 수 있어요.</p>
          </div>
          <Button type="button" variant="primary" size={40}>
            참가 신청 준비
          </Button>
        </section>
        <div className="event-home__work-intro">
          <h2>참가자를 받는 방법</h2>
          <p>행사에 맞는 방법으로 시작해 보세요.</p>
        </div>
        <div className="event-home__cards">
          {ways.map((item) => (
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
        <p className="event-home__note">참가자는 링크나 QR로 신청하며 SCENE 계정이 필요하지 않아요.</p>
      </div>
    </OperatorShell>
  );
}
