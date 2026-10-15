import { useEffect, useRef, type ReactNode } from "react";
import "./PublicFlowDialog.css";

type PublicFlowDialogProps = {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
  footer: ReactNode;
};

function focusableIn(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
    (element) => !element.hidden && element.tabIndex !== -1 && !element.hasAttribute("disabled"),
  );
}

export function PublicFlowDialog({
  title,
  eyebrow,
  onClose,
  wide = false,
  children,
  footer,
}: PublicFlowDialogProps) {
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
      if (event.key !== "Tab" || !dialog) {
        return;
      }
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
    <div
      className="public-flow"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`public-flow__dialog${wide ? " public-flow__dialog--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-flow-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        {eyebrow ? <p className="public-flow__eyebrow">{eyebrow}</p> : null}
        <h2 className="public-flow__title" id="public-flow-title">
          {title}
        </h2>
        <div className="public-flow__body">{children}</div>
        <div className="public-flow__rule" />
        <div className="public-flow__footer">{footer}</div>
      </div>
    </div>
  );
}
