import type { ReactNode } from "react";
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
import "./OperatorShell.css";

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

export function OperatorShell({
  title,
  leading,
  action,
  children,
}: {
  title: string;
  leading?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="operator-shell">
      <aside className="operator-shell__sidebar">
        <div className="operator-shell__brand">
          <span className="operator-shell__logo">
            <img src={symbol} alt="" width={36} height={36} aria-hidden="true" />
            <span className="scene-wordmark">SCENE</span>
          </span>
          <button className="operator-shell__collapse" type="button" aria-label="사이드바 접기">
            <img className="operator-shell__collapse-icon" src={caret} alt="" />
          </button>
        </div>
        <nav className="operator-shell__nav" aria-label="운영 메뉴">
          <ul className="operator-shell__group">
            {primary.map((item) => (
              <li key={item.label}>
                <NavItem item={item} />
              </li>
            ))}
          </ul>
          <div className="operator-shell__section">
            <p className="operator-shell__section-label">행사 운영</p>
            <ul className="operator-shell__group">
              {operation.map((item) => (
                <li key={item.label}>
                  <NavItem item={item} />
                </li>
              ))}
            </ul>
          </div>
          <ul className="operator-shell__group">
            {system.map((item) => (
              <li key={item.label}>
                <NavItem item={item} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="operator-shell__org">
          <span className="operator-shell__org-main">
            <span className="operator-shell__avatar" aria-hidden="true">
              M
            </span>
            <span className="operator-shell__org-name">드림공동체</span>
          </span>
          <img src={caretVertical} alt="" aria-hidden="true" />
        </div>
      </aside>
      <main className="operator-shell__main">
        <header className="operator-shell__header">
          <div className="operator-shell__heading">
            {leading}
            <h1 className="operator-shell__title">{title}</h1>
          </div>
          {action}
        </header>
        {children}
      </main>
    </div>
  );
}

function NavItem({ item }: { item: { label: string; icon: string; caret?: boolean } }) {
  const current = item.label === "행사";
  return (
    <button
      className={`operator-shell__item${current ? " operator-shell__item--current" : ""}`}
      type="button"
      aria-current={current ? "page" : undefined}
    >
      <span className="operator-shell__item-main">
        <img src={item.icon} alt="" />
        {item.label}
      </span>
      {item.caret ? <img src={caret} alt="" /> : null}
    </button>
  );
}
