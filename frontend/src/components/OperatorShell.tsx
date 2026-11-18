import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import symbol from "../assets/scene-symbol-header.svg";
import events from "../assets/event-nav/events.svg";
import bell from "../assets/event-nav/bell.svg";
import note from "../assets/event-nav/note.svg";
import clipboard from "../assets/event-nav/clipboard.svg";
import envelope from "../assets/event-nav/envelope.svg";
import caret from "../assets/event-nav/caret.svg";
import calendar from "../assets/event-nav/calendar.svg";
import chartLine from "../assets/event-nav/chart-line.svg";
import people from "../assets/event-nav/users-three.svg";
import address from "../assets/event-nav/address.svg";
import briefcase from "../assets/event-nav/briefcase.svg";
import squares from "../assets/event-nav/squares.svg";
import gear from "../assets/event-nav/gear.svg";
import caretVertical from "../assets/event-nav/caret-vertical.svg";
import "./OperatorShell.css";

// The start-up from /login/done plays once per history entry, even if the shell mounts again
// (a loading shell first, then the page).
const bootedKeys = new Set<string>();

function useBootEntrance(): boolean {
  const location = useLocation();
  const [boot] = useState(() => {
    const asked = (location.state as { boot?: boolean } | null)?.boot === true;
    if (!asked || bootedKeys.has(location.key)) return false;
    bootedKeys.add(location.key);
    return true;
  });
  return boot;
}

function matchesPath(pathname: string, href?: string): boolean {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const COLLAPSED_KEY = "scene.operatorSidebar.collapsed";

/** Collapsed state is a per-browser convenience; storage failures fall back to expanded. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(COLLAPSED_KEY, "1");
    else localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Keep the in-memory state only.
  }
}

/** Organization sidebar. Menus without a screen yet open the shared "준비 중" page at their own address. */
const primary = [
  { label: "행사", icon: events, to: "/events" },
  { label: "알림", icon: bell, to: "/notifications" },
  { label: "기록", icon: note, to: "/history" },
  { label: "준비 업무", icon: clipboard, to: "/tasks" },
  { label: "안내", icon: envelope, to: "/guides" },
  { label: "일정", icon: calendar, to: "/schedule" },
];

const operation = [
  { label: "현장 운영", icon: chartLine, to: "/field" },
  { label: "참가 현황", icon: address, to: "/participants" },
  { label: "운영 멤버", icon: briefcase, to: "/operators" },
];

const system = [
  { label: "연동", icon: squares, to: "/integrations" },
  { label: "설정", icon: gear, to: "/settings" },
];

export function OperatorShell({
  title,
  leading,
  action,
  eventName,
  eventHref,
  eventAreas = [],
  participantsHref,
  tasksHref,
  framed,
  spaceName,
  children,
}: {
  title: string;
  leading?: ReactNode;
  action?: ReactNode;
  eventName?: string;
  eventHref?: string;
  eventAreas?: string[];
  participantsHref?: string;
  tasksHref?: string;
  framed?: boolean;
  spaceName?: string;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const onParticipants = matchesPath(pathname, participantsHref);
  const onTasks = matchesPath(pathname, tasksHref);
  const operatorsHref = eventHref ? `${eventHref}/operators` : undefined;
  const onOperators = matchesPath(pathname, operatorsHref);
  const areasHref = eventHref ? `${eventHref}/areas` : undefined;
  const settingsHref = eventHref ? `${eventHref}/settings` : undefined;
  const fieldHref = eventHref ? `${eventHref}/field` : undefined;
  const groupsHref = eventHref ? `${eventHref}/groups` : undefined;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const boot = useBootEntrance();
  function toggleCollapsed() {
    setCollapsed((value) => {
      writeCollapsed(!value);
      return !value;
    });
  }
  return (
    <div
      className={`operator-shell${collapsed ? " operator-shell--collapsed" : ""}${boot ? " operator-shell--boot" : ""}`}
    >
      {boot ? <div className="operator-shell__curtain" aria-hidden="true" /> : null}
      <aside className="operator-shell__sidebar">
        <div className="operator-shell__brand">
          <span className="operator-shell__logo">
            <img src={symbol} alt="" width={36} height={36} aria-hidden="true" />
            <span className="scene-wordmark">SCENE</span>
          </span>
          <button
            className="operator-shell__collapse"
            type="button"
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <img className="operator-shell__collapse-icon" src={caret} alt="" />
          </button>
        </div>
        <nav className="operator-shell__nav" aria-label="운영 메뉴">
          {eventName ? (
            <>
              <ul className="operator-shell__group">
                <li>
                  <NavItem
                    item={{
                      label: eventName,
                      icon: events,
                      current: Boolean(eventHref) && pathname === eventHref,
                      to: eventHref,
                    }}
                  />
                </li>
              </ul>
              {eventHref ? (
                <div className="operator-shell__section">
                  <p className="operator-shell__section-label">행사 운영</p>
                  <ul className="operator-shell__group">
                    {eventAreas.includes("tasks") ? (
                      <li>
                        <NavItem item={{ label: "준비 업무", icon: clipboard, current: onTasks, to: tasksHref }} />
                      </li>
                    ) : null}
                    {eventAreas.includes("participants") ? (
                      <li>
                        <NavItem
                          item={{
                            label: "참가 현황",
                            icon: address,
                            current: onParticipants,
                            to: participantsHref,
                          }}
                        />
                      </li>
                    ) : null}
                    <li>
                      <NavItem
                        item={{ label: "현장 운영", icon: chartLine, current: matchesPath(pathname, fieldHref), to: fieldHref }}
                      />
                    </li>
                    <li>
                      <NavItem
                        item={{ label: "조 편성", icon: people, current: matchesPath(pathname, groupsHref), to: groupsHref }}
                      />
                    </li>
                    {operatorsHref ? (
                      <li>
                        <NavItem item={{ label: "운영 멤버", icon: briefcase, current: onOperators, to: operatorsHref }} />
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              <ul className="operator-shell__group">
                <li>
                  <NavItem
                    item={{ label: "다른 기능 시작", icon: squares, current: matchesPath(pathname, areasHref), to: areasHref }}
                  />
                </li>
                <li>
                  <NavItem
                    item={{ label: "설정", icon: gear, current: matchesPath(pathname, settingsHref), to: settingsHref }}
                  />
                </li>
              </ul>
            </>
          ) : (
            <>
              <ul className="operator-shell__group">
                {primary.map((item) => (
                  <li key={item.label}>
                    <NavItem item={{ ...item, current: matchesPath(pathname, item.to) }} />
                  </li>
                ))}
              </ul>
              <div className="operator-shell__section">
                <p className="operator-shell__section-label">행사 운영</p>
                <ul className="operator-shell__group">
                  {operation.map((item) => (
                    <li key={item.label}>
                      <NavItem item={{ ...item, current: matchesPath(pathname, item.to) }} />
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="operator-shell__group">
                {system.map((item) => (
                  <li key={item.label}>
                    <NavItem item={{ ...item, current: matchesPath(pathname, item.to) }} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>
        <div className="operator-shell__org">
          <span className="operator-shell__org-main">
            <span className="operator-shell__avatar" aria-hidden="true">
              {spaceName ? Array.from(spaceName)[0] : ""}
            </span>
            <span className="operator-shell__org-name">{spaceName ?? ""}</span>
          </span>
          <img src={caretVertical} alt="" aria-hidden="true" />
        </div>
      </aside>
      <main className={framed ? "operator-shell__main operator-shell__main--framed" : "operator-shell__main"}>
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

function NavItem({
  item,
}: {
  item: { label: string; icon: string; caret?: boolean; current?: boolean; to?: string };
}) {
  const current = item.current ?? false;
  const className = `operator-shell__item${current ? " operator-shell__item--current" : ""}`;
  const content = (
    <>
      <span className="operator-shell__item-main">
        <img src={item.icon} alt="" />
        <span className="operator-shell__label">{item.label}</span>
      </span>
      {item.caret ? <img src={caret} alt="" /> : null}
    </>
  );
  if (item.to) {
    return (
      <Link className={className} to={item.to} title={item.label} aria-current={current ? "page" : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button className={className} type="button" title={item.label} aria-current={current ? "page" : undefined}>
      {content}
    </button>
  );
}
