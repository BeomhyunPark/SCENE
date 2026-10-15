import symbol from "../assets/scene-symbol-header.svg";
import events from "../assets/event-nav/events.svg";
import bell from "../assets/event-nav/bell.svg";
import note from "../assets/event-nav/note.svg";
import clipboard from "../assets/event-nav/clipboard.svg";
import envelope from "../assets/event-nav/envelope.svg";
import caret from "../assets/event-nav/caret.svg";
import calendar from "../assets/event-nav/calendar.svg";
import chartLine from "../assets/event-nav/chart-line.svg";
import address from "../assets/event-nav/address.svg";
import briefcase from "../assets/event-nav/briefcase.svg";
import squares from "../assets/event-nav/squares.svg";
import gear from "../assets/event-nav/gear.svg";
import caretVertical from "../assets/event-nav/caret-vertical.svg";
import calendarPlus from "../assets/event-nav/calendar-plus.svg";
import plus from "../assets/event-nav/plus.svg";
import { Button } from "./Button";
import "./EventList.css";

const primary = [
  { label: "행사", icon: events },
  { label: "알림", icon: bell },
  { label: "기록", icon: note },
  { label: "준비 업무", icon: clipboard },
  { label: "안내", icon: envelope, caret: true },
  { label: "일정", icon: calendar },
];

const operation = [
  { label: "현장 운영", icon: chartLine },
  { label: "참가자", icon: address },
  { label: "운영 멤버", icon: briefcase },
];

const system = [
  { label: "연동", icon: squares },
  { label: "설정", icon: gear },
];

export function EventList() {
  return (
    <div className="event-list">
      <aside className="event-list__sidebar">
        <div className="event-list__brand">
          <span className="event-list__logo">
            <img src={symbol} alt="" width={36} height={36} aria-hidden="true" />
            <span className="scene-wordmark">SCENE</span>
          </span>
          <button className="event-list__collapse" type="button" aria-label="사이드바 접기">
            <img className="event-list__collapse-icon" src={caret} alt="" />
          </button>
        </div>
        <nav className="event-list__nav" aria-label="운영 메뉴">
          <ul className="event-list__group">
            {primary.map((item) => (
              <li key={item.label}>
                <NavItem item={item} />
              </li>
            ))}
          </ul>
          <div className="event-list__section">
            <p className="event-list__section-label">행사 운영</p>
            <ul className="event-list__group">
              {operation.map((item) => (
                <li key={item.label}>
                  <NavItem item={item} />
                </li>
              ))}
            </ul>
          </div>
          <ul className="event-list__group">
            {system.map((item) => (
              <li key={item.label}>
                <NavItem item={item} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="event-list__org">
          <span className="event-list__org-main">
            <span className="event-list__avatar" aria-hidden="true">
              M
            </span>
            <span className="event-list__org-name">드림공동체</span>
          </span>
          <img src={caretVertical} alt="" aria-hidden="true" />
        </div>
      </aside>
      <main className="event-list__main">
        <header className="event-list__header">
          <h1 className="event-list__page-title">행사</h1>
          <Button type="button" variant="secondary" size={40} className="event-list__new">
            <img src={plus} alt="" />
            새 행사
          </Button>
        </header>
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
            <Button type="button" variant="primary" size={40}>
              첫 행사 만들기
            </Button>
          </section>
        </div>
      </main>
    </div>
  );
}

function NavItem({ item }: { item: { label: string; icon: string; caret?: boolean } }) {
  const current = item.label === "행사";
  return (
    <button
      className={`event-list__item${current ? " event-list__item--current" : ""}`}
      type="button"
      aria-current={current ? "page" : undefined}
    >
      <span className="event-list__item-main">
        <img src={item.icon} alt="" />
        {item.label}
      </span>
      {item.caret ? <img src={caret} alt="" /> : null}
    </button>
  );
}
