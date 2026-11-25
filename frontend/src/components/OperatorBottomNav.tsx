import { Link, useLocation } from "react-router";
import { bottomNavItems, type OperatorMenu } from "./operatorMenu";

/**
 * 휴대폰·태블릿 하단 메뉴 막대 (#368). Frequent screens and 알림 plus 전체 메뉴, which opens the same
 * drawer as the header button. Hidden from 1024px, where the sidebar shows everything.
 */
export function OperatorBottomNav({
  menu,
  drawerId,
  menuOpen,
  onOpenMenu,
}: {
  menu: OperatorMenu;
  drawerId: string;
  menuOpen: boolean;
  onOpenMenu: (opener: HTMLElement) => void;
}) {
  const { pathname } = useLocation();
  const items = bottomNavItems(menu, pathname);
  return (
    <nav className="operator-bottom-nav" aria-label="주요 메뉴" inert={menuOpen}>
      <ul className="operator-bottom-nav__list">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              className={`operator-bottom-nav__item scene-press scene-press--quiet scene-press--inset${item.current ? " operator-bottom-nav__item--current" : ""}`}
              to={item.to!}
              aria-current={item.current ? "page" : undefined}
            >
              <img src={item.icon} alt="" width={24} height={24} />
              {item.badge ? (
                <span className="operator-bottom-nav__badge" aria-label={`읽지 않은 알림 ${item.badge}개`}>
                  {item.badge}
                </span>
              ) : null}
              <span className="operator-bottom-nav__label">{item.label}</span>
            </Link>
          </li>
        ))}
        <li>
          <button
            className="operator-bottom-nav__item scene-press scene-press--quiet scene-press--inset"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls={drawerId}
            onClick={(event) => onOpenMenu(event.currentTarget)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="operator-bottom-nav__label">전체 메뉴</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
