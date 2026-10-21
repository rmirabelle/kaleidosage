import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** How far the pointer moves, in px, before a press on an item becomes a drag; a shorter move stays a click. */
const DRAG_START = 5;

/**
 * Drag to reorder the items of a list (the scene tabs, the audio files). A
 * press on an item, then a move of more than DRAG_START px, starts the drag.
 * While the pointer moves, the item takes the place the pointer is at, and
 * the new order goes to "onReorder" at once. Each item needs data-key with
 * its key; other children of the list (a help button) do not count.
 *
 * With "rows", the list wraps onto several rows: an item is before the
 * pointer when its row is above the pointer, or when it is in the pointer's
 * row and its middle is left of the pointer. Without it, the list is one
 * column, and an item is before the pointer when its middle is above it.
 */
export function useDragReorder<K extends string | number>(order: readonly K[], onReorder: (order: K[]) => void, rows = false) {
  const list = useRef<HTMLElement | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const [dragging, setDragging] = useState<K | null>(null);
  /** True after a drag, until takeClick reads it. */
  const dragged = useRef(false);

  /** The pointer-down handler for the item with "key". */
  const start = (key: K) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const [startX, startY] = [event.clientX, event.clientY];
    let moving = false;
    dragged.current = false;
    const move = (moveEvent: PointerEvent) => {
      if (!moving) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_START) return;
        moving = true;
        dragged.current = true;
        setDragging(key);
      }
      let place = 0;
      for (const item of list.current?.children ?? []) {
        if (!(item instanceof HTMLElement) || item.dataset.key === undefined || item.dataset.key === String(key)) continue;
        const rect = item.getBoundingClientRect();
        const before = rows
          ? moveEvent.clientY > rect.bottom || (moveEvent.clientY >= rect.top && moveEvent.clientX > rect.left + rect.width / 2)
          : moveEvent.clientY > rect.top + rect.height / 2;
        if (before) place++;
      }
      const current = orderRef.current;
      if (current.indexOf(key) === place) return;
      const next = current.filter((item) => item !== key);
      next.splice(place, 0, key);
      orderRef.current = next;
      onReorderRef.current(next);
    };
    /* The window gets the moves, not the item: React moves the item in the page as the order changes, and a moved element loses the mouse. */
    const end = () => {
      setDragging(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return {
    /** The ref for the list element. */
    listRef: (element: HTMLElement | null) => { list.current = element; },
    /** The key of the item that is being dragged, or null. */
    dragging,
    start,
    /** True once after a drag, so the click that ends the drag does not also act (play a track). */
    takeClick: () => {
      const was = dragged.current;
      dragged.current = false;
      return was;
    }
  };
}
