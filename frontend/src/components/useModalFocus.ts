import { useEffect, useRef, type RefObject } from "react";

function focusableIn(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
    (element) => !element.hidden && element.tabIndex !== -1 && !element.hasAttribute("disabled"),
  );
}

/**
 * Modal keyboard rules shared by the dialogs: focus moves into the dialog when it opens, Tab stays
 * inside it, Escape closes it, and focus returns to where it was when it closes.
 */
export function useModalFocus(dialogRef: RefObject<HTMLElement | null>, onClose: () => void) {
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
  }, [dialogRef]);
}
