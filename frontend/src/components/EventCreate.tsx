import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendar from "../assets/event-create/calendar.svg";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import "./EventCreate.css";

export function EventCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("2026 가을 공동체 행사");
  const [start, setStart] = useState("2026. 10. 24");
  const [end, setEnd] = useState("2026. 10. 24");
  const [place, setPlace] = useState("드림공동체");
  const [kind, setKind] = useState("선택하지 않음");

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <OperatorShell
      title="새 행사 만들기"
      leading={
        <Link className="event-create__back" to="/events" aria-label="행사 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-create__body">
        <div className="event-create__intro">
          <h2 className="event-create__title">기본 정보</h2>
          <p className="event-create__support">행사 운영을 시작하는 데 필요한 최소 정보만 입력해요.</p>
        </div>
        <form className="event-create__form" onSubmit={hold}>
          <Field label="행사명" id="event-name" value={name} onChange={setName} />
          <div className="event-create__dates">
            <Field label="시작일" id="event-start" value={start} onChange={setStart} icon={calendar} />
            <Field label="종료일" id="event-end" value={end} onChange={setEnd} icon={calendar} />
          </div>
          <Field label="장소" id="event-place" value={place} onChange={setPlace} />
          <Field label="행사 유형 (선택)" id="event-kind" value={kind} onChange={setKind} />
          <div className="event-create__actions">
            <Button type="button" variant="secondary" size={40} onClick={() => navigate("/events")}>
              취소
            </Button>
            <Button type="submit" variant="primary" size={40}>
              행사 만들기
            </Button>
          </div>
        </form>
      </div>
    </OperatorShell>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  icon,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  icon?: string;
}) {
  return (
    <div className="event-create__field">
      <label className="event-create__label" htmlFor={id}>
        {label}
      </label>
      <span className="event-create__control">
        <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
        {icon ? <img src={icon} alt="" aria-hidden="true" /> : null}
      </span>
    </div>
  );
}
