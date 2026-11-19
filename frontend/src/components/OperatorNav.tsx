import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { isApiError } from "../api/errors";
import { logout } from "../api/session";
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
import signOut from "../assets/event-nav/sign-out.svg";

function matchesPath(pathname: string, href?: string): boolean {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
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

export type OperatorMenu = {
  eventName?: string;
  eventHref?: string;
  eventAreas?: string[];
  participantsHref?: string;
  tasksHref?: string;
  spaceName?: string;
};

/**
 * The operator menu shared by the desktop sidebar and the phone drawer (#368): organization or
 * event menus with the current page marked, 로그아웃, and the space name. `onNavigate` runs after a
 * menu link is chosen, so the drawer can close.
 */
export function OperatorNav({
  eventName,
  eventHref,
  eventAreas = [],
  participantsHref,
  tasksHref,
  spaceName,
  onNavigate,
}: OperatorMenu & { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const operatorsHref = eventHref ? `${eventHref}/operators` : undefined;
  const areasHref = eventHref ? `${eventHref}/areas` : undefined;
  const settingsHref = eventHref ? `${eventHref}/settings` : undefined;
  const fieldHref = eventHref ? `${eventHref}/field` : undefined;
  const groupsHref = eventHref ? `${eventHref}/groups` : undefined;
  const item = (label: string, icon: string, to: string | undefined, current = matchesPath(pathname, to)) => (
    <li key={label}>
      <NavItem item={{ label, icon, current, to }} onNavigate={onNavigate} />
    </li>
  );
  return (
    <>
      <nav className="operator-shell__nav" aria-label="운영 메뉴">
        {eventName ? (
          <>
            <ul className="operator-shell__group">
              {item(eventName, events, eventHref, Boolean(eventHref) && pathname === eventHref)}
            </ul>
            {eventHref ? (
              <div className="operator-shell__section">
                <p className="operator-shell__section-label">행사 운영</p>
                <ul className="operator-shell__group">
                  {eventAreas.includes("tasks") ? item("준비 업무", clipboard, tasksHref) : null}
                  {eventAreas.includes("participants") ? item("참가 현황", address, participantsHref) : null}
                  {item("현장 운영", chartLine, fieldHref)}
                  {item("조 편성", people, groupsHref)}
                  {operatorsHref ? item("운영 멤버", briefcase, operatorsHref) : null}
                </ul>
              </div>
            ) : null}
            <ul className="operator-shell__group">
              {item("다른 기능 시작", squares, areasHref)}
              {item("설정", gear, settingsHref)}
            </ul>
          </>
        ) : (
          <>
            <ul className="operator-shell__group">{primary.map((menu) => item(menu.label, menu.icon, menu.to))}</ul>
            <div className="operator-shell__section">
              <p className="operator-shell__section-label">행사 운영</p>
              <ul className="operator-shell__group">{operation.map((menu) => item(menu.label, menu.icon, menu.to))}</ul>
            </div>
            <ul className="operator-shell__group">{system.map((menu) => item(menu.label, menu.icon, menu.to))}</ul>
          </>
        )}
      </nav>
      <SignOut />
      <div className="operator-shell__org">
        <span className="operator-shell__org-main">
          <span className="operator-shell__avatar" aria-hidden="true">
            {spaceName ? Array.from(spaceName)[0] : ""}
          </span>
          <span className="operator-shell__org-name">{spaceName ?? ""}</span>
        </span>
        <img src={caretVertical} alt="" aria-hidden="true" />
      </div>
    </>
  );
}

/** Ends the operator session, drops every cached answer of this account, and opens the login page. */
function SignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);
  const leave = () => {
    queryClient.clear();
    navigate("/login", { replace: true });
  };
  const signingOut = useMutation({
    mutationFn: logout,
    retry: false,
    onMutate: () => setFailed(false),
    onSuccess: leave,
    onError: (error) => {
      // The session is already gone: same outcome as a sign-out.
      if (isApiError(error) && error.status === 401) leave();
      else setFailed(true);
    },
  });
  return (
    <div className="operator-shell__account">
      {failed ? (
        <p className="operator-shell__account-error" role="alert">
          로그아웃하지 못했어요. 다시 시도해 주세요.
        </p>
      ) : null}
      <button
        className="operator-shell__item"
        type="button"
        title="로그아웃"
        disabled={signingOut.isPending}
        onClick={() => signingOut.mutate()}
      >
        <span className="operator-shell__item-main">
          <img src={signOut} alt="" />
          <span className="operator-shell__label">로그아웃</span>
        </span>
      </button>
    </div>
  );
}

function NavItem({
  item,
  onNavigate,
}: {
  item: { label: string; icon: string; caret?: boolean; current?: boolean; to?: string };
  onNavigate?: () => void;
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
      <Link
        className={className}
        to={item.to}
        title={item.label}
        aria-current={current ? "page" : undefined}
        onClick={onNavigate}
      >
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
