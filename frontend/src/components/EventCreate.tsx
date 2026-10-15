import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendar from "../assets/event-create/calendar.svg";
import caret from "../assets/event-nav/caret.svg";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { formatSceneDate, saveEventDraft } from "./eventDraft";
import "./EventCreate.css";

const eventTypes = ["수련회", "비전트립", "아웃리치", "단기선교", "성경학교", "캠프", "워크숍", "기타"];

export function EventCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [place, setPlace] = useState("");
  const [kind, setKind] = useState("");
  const [nameMissing, setNameMissing] = useState(false);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMissing(true);
      return;
    }
    if (start && end && end < start) return;
    const id = crypto.randomUUID();
    saveEventDraft(id, { name: trimmed, type: kind, start, end, place: place.trim(), areas: [] });
    navigate(`/events/${id}`);
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
        <form className="event-create__form" onSubmit={create}>
          <div className="event-create__field">
            <label className="event-create__label" htmlFor="event-name">
              행사명
            </label>
            <span className="event-create__control">
              <input
                id="event-name"
                value={name}
                placeholder="2026 가을 공동체 행사"
                aria-invalid={nameMissing}
                aria-describedby={nameMissing ? "event-name-error" : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameMissing(false);
                }}
              />
            </span>
            {nameMissing ? (
              <p id="event-name-error" className="event-create__error" role="alert">
                행사명을 입력해 주세요.
              </p>
            ) : null}
          </div>
          <div className="event-create__dates">
            <DateField
              label="시작일"
              id="event-start"
              value={start}
              max={end}
              onChange={(value) => {
                if (end && value > end) return;
                setStart(value);
              }}
            />
            <DateField
              label="종료일"
              id="event-end"
              value={end}
              min={start}
              onChange={(value) => {
                if (start && value < start) return;
                setEnd(value);
              }}
            />
          </div>
          <div className="event-create__field">
            <label className="event-create__label" htmlFor="event-place">
              장소
            </label>
            <span className="event-create__control">
              <input
                id="event-place"
                value={place}
                placeholder="드림공동체"
                onChange={(event) => setPlace(event.target.value)}
              />
            </span>
          </div>
          <div className="event-create__field">
            <label className="event-create__label" htmlFor="event-kind">
              행사 유형 (선택)
            </label>
            <span className="event-create__control">
              <select
                id="event-kind"
                className={kind === "" ? "event-create__select event-create__select--empty" : "event-create__select"}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="">선택하지 않음</option>
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <img src={caret} alt="" aria-hidden="true" />
            </span>
          </div>
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

function DateField({
  label,
  id,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);

  function open() {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  function openFromKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  }

  return (
    <div className="event-create__field">
      <label className="event-create__label" htmlFor={id}>
        {label}
      </label>
      <span className="event-create__control">
        <input
          id={id}
          readOnly
          value={value ? formatSceneDate(value) : ""}
          placeholder="2026. 10. 24"
          onClick={open}
          onKeyDown={openFromKey}
        />
        <input
          ref={picker}
          id={`${id}-picker`}
          className="event-create__picker"
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={min || undefined}
          max={max || undefined}
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if ((min && next && next < min) || (max && next && next > max)) {
              event.target.value = value;
              return;
            }
            onChange(next);
          }}
        />
        <button className="event-create__calendar" type="button" aria-label={`${label} 선택`} onClick={open}>
          <img src={calendar} alt="" />
        </button>
      </span>
    </div>
  );
}
