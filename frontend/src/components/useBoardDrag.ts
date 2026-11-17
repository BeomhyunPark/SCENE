import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DropTarget } from "./groupDrop";

/**
 * Pointer-event drag for the group board (#343). HTML5 drag events do not fire for touch on most phones and
 * tablets, so this follows the pointer itself: mouse drags start anywhere on a row after a few pixels; touch
 * and pen start only on the grip (which has `touch-action: none`), so a finger elsewhere still scrolls.
 *
 * Drop targets are found under the pointer by data attributes, so the markup stays plain:
 * - `data-drop="member"` + `data-group-id` + `data-participant-id` + `data-next-id`: a member row; the upper
 *   half drops in front of it, the lower half in front of the next one (or at the end).
 * - `data-drop="group"` + `data-group-id` (+ `data-next-group-id` on the card): a group card or its end zone.
 * - `data-drop="pool"`: the 미배정 area (unassign).
 * - `data-drop="page"` + `data-dir="-1|1"`: the edge zones shown while dragging; holding there turns the page.
 * Escape cancels. A drag never fires the click it started on.
 */
export type DragItem =
  | { kind: "people"; ids: string[]; label: string }
  | { kind: "group"; groupId: string; label: string };

export type DragOver = DropTarget | { kind: "group-slot"; beforeGroupId: string | null } | { kind: "page"; dir: -1 | 1 } | null;

export type DragState = { item: DragItem; x: number; y: number; over: DragOver };

const THRESHOLD = 6;
const PAGE_HOLD_MS = 550;
const EDGE = 56;

export function useBoardDrag({
  onDropPeople,
  onDropGroup,
  onPage,
}: {
  onDropPeople: (ids: string[], target: DropTarget) => void;
  onDropGroup: (groupId: string, beforeGroupId: string | null) => void;
  onPage: (dir: -1 | 1) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const handlers = useRef({ onDropPeople, onDropGroup, onPage });
  useEffect(() => {
    handlers.current = { onDropPeople, onDropGroup, onPage };
  });
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  function start(event: ReactPointerEvent<HTMLElement>, item: DragItem, fromGrip: boolean) {
    if (event.button !== 0 || cleanup.current) return;
    if (event.pointerType !== "mouse" && !fromGrip) return;
    if (!fromGrip && (event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    // No text selection or native drag of the selection: either would cancel the pointer stream.
    if (event.pointerType === "mouse") event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let active = false;
    let over: DragOver = null;
    let last = { x: startX, y: startY };
    let pageTimer: number | null = null;
    let pageDir: -1 | 1 | null = null;
    let scrollTimer: number | null = null;

    const clearPage = () => {
      if (pageTimer !== null) window.clearTimeout(pageTimer);
      pageTimer = null;
      pageDir = null;
    };
    const holdPage = (dir: -1 | 1) => {
      if (pageDir === dir) return;
      clearPage();
      pageDir = dir;
      const tick = () => {
        handlers.current.onPage(dir);
        pageTimer = window.setTimeout(tick, PAGE_HOLD_MS * 1.6);
      };
      pageTimer = window.setTimeout(tick, PAGE_HOLD_MS);
    };

    const locate = (x: number, y: number): DragOver => {
      const hit = document.elementFromPoint(x, y);
      const zone = hit instanceof Element ? hit.closest<HTMLElement>("[data-drop]") : null;
      if (!zone) return null;
      const kind = zone.dataset.drop;
      if (kind === "page") return { kind: "page", dir: zone.dataset.dir === "-1" ? -1 : 1 };
      if (item.kind === "group") {
        const card = zone.closest<HTMLElement>("[data-group-card]");
        if (!card) return null;
        const rect = card.getBoundingClientRect();
        const before = x < rect.left + rect.width / 2 ? card.dataset.groupId! : (card.dataset.nextGroupId ?? null);
        return { kind: "group-slot", beforeGroupId: before || null };
      }
      if (kind === "pool") return { kind: "pool" };
      if (kind === "member") {
        const rect = zone.getBoundingClientRect();
        const upper = y < rect.top + rect.height / 2;
        const before = upper ? zone.dataset.participantId! : zone.dataset.nextId || null;
        return { kind: "group", groupId: zone.dataset.groupId!, beforeId: before };
      }
      if (kind === "group") return { kind: "group", groupId: zone.dataset.groupId!, beforeId: null };
      return null;
    };

    const scrollLoop = () => {
      const { y } = last;
      const by = y < EDGE ? -14 : y > window.innerHeight - EDGE ? 14 : 0;
      if (by !== 0) window.scrollBy(0, by);
      scrollTimer = window.setTimeout(scrollLoop, 30);
    };

    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      last = { x: pointer.clientX, y: pointer.clientY };
      if (!active) {
        if (Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < THRESHOLD) return;
        active = true;
        document.body.classList.add("event-groups--dragging");
        scrollLoop();
      }
      pointer.preventDefault();
      over = locate(pointer.clientX, pointer.clientY);
      if (over?.kind === "page") holdPage(over.dir);
      else clearPage();
      setDrag({ item, x: pointer.clientX, y: pointer.clientY, over });
    };

    const swallowClick = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };

    const finish = (drop: boolean) => {
      const target = over;
      const wasActive = active;
      stop();
      if (!wasActive) return;
      // The click that follows pointerup must not toggle a checkbox or open a row.
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }), 0);
      if (!drop || !target) return;
      if (item.kind === "group" && target.kind === "group-slot") {
        handlers.current.onDropGroup(item.groupId, target.beforeGroupId);
      } else if (item.kind === "people" && (target.kind === "group" || target.kind === "pool")) {
        handlers.current.onDropPeople(item.ids, target);
      }
    };

    const up = (pointer: PointerEvent) => {
      if (pointer.pointerId === pointerId) finish(true);
    };
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId === pointerId) finish(false);
    };
    const key = (press: KeyboardEvent) => {
      if (press.key === "Escape" && active) {
        press.preventDefault();
        finish(false);
      }
    };

    function stop() {
      clearPage();
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      document.body.classList.remove("event-groups--dragging");
      cleanup.current = null;
      setDrag(null);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    cleanup.current = stop;
  }

  return { drag, start };
}
