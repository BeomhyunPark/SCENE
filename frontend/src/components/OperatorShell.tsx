import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import symbol from "../assets/scene-symbol-header.svg";
import caret from "../assets/event-nav/caret.svg";
import { OperatorBottomNav } from "./OperatorBottomNav";
import { OperatorMenuDrawer } from "./OperatorMenuDrawer";
import { OperatorNav } from "./OperatorNav";
import { badgeText } from "../api/operatorNotifications";
import { useOperatorUpdatesPolling, useOperatorUpdatesValue } from "./useOperatorUpdates";
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
  // Inside an event the shell runs the operator refresh check and shows the unread badge (#436).
  const eventId = eventHref ? /^\/events\/([^/]+)$/.exec(eventHref)?.[1] : undefined;
  useOperatorUpdatesPolling(eventId);
  const updates = useOperatorUpdatesValue(eventId);
  const notificationsBadge = updates ? badgeText(updates.notifications.unreadCount) : null;
  const menu = { eventName, eventHref, eventAreas, participantsHref, tasksHref, spaceName, notificationsBadge };
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const boot = useBootEntrance();
  const drawerId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // Focus returns to the button that opened the drawer (header or bottom bar) once the page is no longer inert.
    if (wasOpen.current && !menuOpen && opener.current?.isConnected) opener.current.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);
  function openMenu(from: HTMLElement) {
    opener.current = from;
    setMenuOpen(true);
  }
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
      <aside className="operator-shell__sidebar" inert={menuOpen}>
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
        <OperatorNav {...menu} />
      </aside>
      <main
        className={framed ? "operator-shell__main operator-shell__main--framed" : "operator-shell__main"}
        inert={menuOpen}
      >
        <header className="operator-shell__header">
          <div className="operator-shell__heading">
            <button
              className="operator-shell__menu-button"
              type="button"
              aria-label="메뉴 열기"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls={drawerId}
              onClick={(event) => openMenu(event.currentTarget)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            {leading}
            <h1 className="operator-shell__title">{title}</h1>
          </div>
          {action}
        </header>
        {children}
      </main>
      <OperatorBottomNav menu={menu} drawerId={drawerId} menuOpen={menuOpen} onOpenMenu={openMenu} />
      <OperatorMenuDrawer id={drawerId} open={menuOpen} onClose={() => setMenuOpen(false)} menu={menu} />
    </div>
  );
}
