import { useEffect, useRef, type ReactNode } from "react";
import "./ConfirmDialog.css";

function focusableIn(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
    (element) => !element.hidden && element.tabIndex !== -1 && !element.hasAttribute("disabled"),
  );
}

export function ConfirmDialog({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusableIn(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const atEdge = active === dialog || !dialog.contains(active);
      if (event.shiftKey) {
        if (atEdge || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (atEdge || active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, []);
  return (
    <div className="confirm-dialog">
      <div
        ref={dialogRef}
        className="confirm-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        <div className="confirm-dialog__body">{children}</div>
        <div className="confirm-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}
