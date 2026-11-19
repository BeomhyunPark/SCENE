import { useEffect, useRef } from "react";
import symbol from "../assets/scene-symbol-header.svg";
import { OperatorNav, type OperatorMenu } from "./OperatorNav";

/** Screens at least this wide show the sidebar instead, so an open drawer closes there. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * 휴대폰·태블릿 운영 메뉴 서랍 (#368). The sidebar's menu in a modal dialog from the left: a menu
 * link, the backdrop, Esc and 닫기 close it; Tab stays inside and the page behind does not scroll.
 * Kept in the DOM (hidden while closed) so the header button's aria-controls always points at it.
 */
export function OperatorMenuDrawer({
  id,
  open,
  onClose,
  menu,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  menu: OperatorMenu;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const { body } = document;
    const overflow = body.style.overflow;
    body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (!panel.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...panel.current.querySelectorAll<HTMLElement>("button, a[href]")].filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = active === panel.current || !panel.current.contains(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);

    const desktop = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP_QUERY) : null;
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches) onCloseRef.current();
    };
    desktop?.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop?.removeEventListener("change", onWide);
      body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div className="operator-drawer" hidden={!open}>
      <div className="operator-drawer__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        id={id}
        className="operator-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="운영 메뉴"
        tabIndex={-1}
      >
        <div className="operator-shell__brand">
          <span className="operator-shell__logo">
            <img src={symbol} alt="" width={36} height={36} aria-hidden="true" />
            <span className="scene-wordmark">SCENE</span>
          </span>
          <button ref={closeButton} className="operator-drawer__close" type="button" aria-label="메뉴 닫기" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {open ? <OperatorNav {...menu} onNavigate={onClose} /> : null}
      </div>
    </div>
  );
}
