/**
 * Focus management for modal surfaces (<BottomSheet>): keep Tab inside,
 * close on Escape, and hand focus back to whatever opened the sheet.
 *
 * Written against tiny structural interfaces instead of the DOM so it is
 * unit-tested in node without jsdom (same approach as useBodyScrollLock).
 * The real `document` and elements satisfy these interfaces.
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export interface FocusTarget {
  focus(options?: { preventScroll?: boolean }): void;
}

export interface TrapElement extends FocusTarget {
  getAttribute?(name: string): string | null;
  getClientRects?(): { length: number };
  isConnected?: boolean;
}

export interface TrapContainer extends FocusTarget {
  contains(node: unknown): boolean;
  querySelectorAll(selector: string): ArrayLike<TrapElement>;
}

export interface TrapKeyEvent {
  key: string;
  shiftKey: boolean;
  preventDefault(): void;
}

export interface TrapDocument {
  readonly activeElement: unknown;
  addEventListener(type: "keydown", listener: (event: TrapKeyEvent) => void, capture?: boolean): void;
  removeEventListener(type: "keydown", listener: (event: TrapKeyEvent) => void, capture?: boolean): void;
}

function isShown(el: TrapElement): boolean {
  if (el.getAttribute?.("aria-hidden") === "true") return false;
  const rects = el.getClientRects?.();
  return rects ? rects.length > 0 : true;
}

/** Focusable, visible elements inside the container, in tab order of the DOM. */
export function focusableWithin(container: TrapContainer): TrapElement[] {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isShown);
}

/**
 * Where Tab should land, or null to let the browser move focus normally.
 * Wraps from the last element to the first (and back with Shift+Tab), and
 * pulls focus back in when it has escaped the container.
 */
export function tabTarget(
  items: readonly TrapElement[],
  active: unknown,
  backwards: boolean,
): TrapElement | null {
  if (items.length === 0) return null;
  const index = items.indexOf(active as TrapElement);
  const first = items[0];
  const last = items[items.length - 1];
  if (index === -1) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === items.length - 1) return first;
  return null;
}

export interface FocusTrapOptions {
  doc: TrapDocument;
  container: TrapContainer;
  /** Focus this first; defaults to the first focusable element, then the container. */
  initialFocus?: FocusTarget | null;
  onEscape?: () => void;
}

/**
 * Start trapping. Returns `release`, which stops listening and restores focus
 * to the element that had it before. Call release AFTER the modal surface is
 * closed, or the browser may refuse focus to the (still inert) page behind it.
 */
export function activateFocusTrap({
  doc,
  container,
  initialFocus,
  onEscape,
}: FocusTrapOptions): () => void {
  const previous = doc.activeElement as (TrapElement & FocusTarget) | null;
  const first = initialFocus ?? focusableWithin(container)[0] ?? container;
  first.focus({ preventScroll: true });

  const onKeyDown = (event: TrapKeyEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableWithin(container);
    if (items.length === 0) {
      event.preventDefault();
      container.focus({ preventScroll: true });
      return;
    }
    const active = doc.activeElement;
    const outside = !container.contains(active);
    const target = tabTarget(items, outside ? null : active, event.shiftKey);
    if (target) {
      event.preventDefault();
      target.focus({ preventScroll: true });
    }
  };
  doc.addEventListener("keydown", onKeyDown, true);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    doc.removeEventListener("keydown", onKeyDown, true);
    if (previous && typeof previous.focus === "function" && previous.isConnected !== false) {
      previous.focus({ preventScroll: true });
    }
  };
}
