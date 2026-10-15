import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import checklist from "../assets/event-home/checklist.svg";
import dateIcon from "../assets/event-home/date.svg";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { eventContext, readEventDraft } from "./eventDraft";
import "./EventHome.css";

const starts = [
  { title: "참가자 받기", detail: "신청 링크 또는 직접 추가", badge: "시작" },
  { title: "준비 업무", detail: "담당자와 마감 정리", badge: "선택" },
  { title: "일정 정리", detail: "필요한 일정만 기록", badge: "선택" },
];

export function EventHome() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const draft = readEventDraft(eventId);
  const title = draft?.name || "행사";
  const context = draft ? eventContext(draft) : "";
  const areas = draft?.areas ?? [];

  return (
    <OperatorShell
      title={title}
      eventName={title}
      eventAreas={areas}
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
            <p className="event-home__state">새로 만든 행사</p>
          </div>
          <span className="event-home__badge">준비 시작</span>
        </div>
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
      </div>
    </OperatorShell>
  );
}
