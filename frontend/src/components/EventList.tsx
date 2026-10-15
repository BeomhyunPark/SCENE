import { useNavigate } from "react-router";
import calendarPlus from "../assets/event-nav/calendar-plus.svg";
import plus from "../assets/event-nav/plus.svg";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import "./EventList.css";

export function EventList() {
  const navigate = useNavigate();

  return (
    <OperatorShell
      title="행사"
      action={
        <Button
          type="button"
          variant="secondary"
          size={40}
          className="event-list__new"
          onClick={() => navigate("/events/new")}
        >
          <img src={plus} alt="" />새 행사
        </Button>
      }
    >
      <div className="event-list__body">
        <div className="event-list__intro">
          <div>
            <h2 className="event-list__title">드림공동체의 행사</h2>
            <p className="event-list__support">준비 중인 행사와 종료된 기록을 한곳에서 관리해요.</p>
          </div>
          <p className="event-list__count">0개의 행사</p>
        </div>
        <section className="event-list__empty">
          <span className="event-list__mark" aria-hidden="true">
            <img src={calendarPlus} alt="" />
          </span>
          <h3 className="event-list__empty-title">아직 만든 행사가 없어요</h3>
          <p className="event-list__empty-copy">
            행사를 먼저 만들고 참가자, 준비 업무와 일정은 필요할 때 시작해요.
          </p>
          <Button type="button" variant="primary" size={40} onClick={() => navigate("/events/new")}>
            첫 행사 만들기
          </Button>
        </section>
      </div>
    </OperatorShell>
  );
}
