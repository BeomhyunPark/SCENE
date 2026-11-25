import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "./RowMenu.css";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * "⋯" row menu (SCENE DS Menu 37:47): one trigger at the end of a list row opens the row's actions.
 * The menu takes focus on open, moves with the arrow keys, Home and End, and closes on Escape, Tab,
 * or a click outside. Choosing an item puts focus back on the trigger first, so a dialog opened from
 * the item returns focus there when it closes. Danger items sit after a divider.
 */
export function RowMenu({ label, items, disabled = false }: { label: string; items: RowMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonsIn = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    buttonsIn()[0]?.focus();
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = buttonsIn();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      buttons[(to + buttons.length) % buttons.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(buttons.length - 1);
    else if (event.key === "Escape") {
      // Keeps an enclosing dialog's Escape handler from closing it too.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") setOpen(false);
  }

  const plain = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);
  const render = (item: RowMenuItem) => {
    return (
      <button
        key={item.label}
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={item.danger ? "row-menu__item row-menu__item--danger" : "row-menu__item"}
        onClick={() => {
          close();
          item.onSelect();
        }}
      >
        {item.label}
      </button>
    );
  };
  return (
    <div className="row-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.5" fill="currentColor" />
          <circle cx="10" cy="10" r="1.5" fill="currentColor" />
          <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} className="row-menu__menu" role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {plain.map(render)}
          {plain.length > 0 && danger.length > 0 ? <div className="row-menu__divider" role="separator" /> : null}
          {danger.map(render)}
        </div>
      ) : null}
    </div>
  );
}
