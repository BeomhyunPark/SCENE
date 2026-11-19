import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { isApiError } from "../api/errors";
import { logout } from "../api/session";
import caret from "../assets/event-nav/caret.svg";
import caretVertical from "../assets/event-nav/caret-vertical.svg";
import signOut from "../assets/event-nav/sign-out.svg";
import { operatorMenuSections, type OperatorMenu } from "./operatorMenu";


/**
 * The operator menu shared by the desktop sidebar and the phone drawer (#368): organization or
 * event menus with the current page marked, 로그아웃, and the space name. `onNavigate` runs after a
 * menu link is chosen, so the drawer can close.
 */
export function OperatorNav({ onNavigate, ...menu }: OperatorMenu & { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <>
      <nav className="operator-shell__nav" aria-label="운영 메뉴">
        {operatorMenuSections(menu, pathname).map((section, index) => {
          const list = (
            <ul key={index} className="operator-shell__group">
              {section.items.map((item) => (
                <li key={item.key}>
                  <NavItem item={item} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          );
          return section.label ? (
            <div key={index} className="operator-shell__section">
              <p className="operator-shell__section-label">{section.label}</p>
              {list}
            </div>
          ) : (
            list
          );
        })}
      </nav>
      <SignOut />
      <div className="operator-shell__org">
        <span className="operator-shell__org-main">
          <span className="operator-shell__avatar" aria-hidden="true">
            {menu.spaceName ? Array.from(menu.spaceName)[0] : ""}
          </span>
          <span className="operator-shell__org-name">{menu.spaceName ?? ""}</span>
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
