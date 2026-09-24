/**
 * Toast queue: a pure reducer, so the rules are tested without a DOM.
 * One toast shows at a time by default; the next waits its turn.
 */

export type ToastTone = "ok" | "info" | "warn" | "bad";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** How long it stays up once visible, in ms. */
  duration: number;
}

export interface ToastState {
  items: Toast[];
  nextId: number;
}

export type ToastAction =
  | { type: "push"; message: string; tone?: ToastTone; duration?: number }
  | { type: "dismiss"; id: number }
  | { type: "clear" };

export const INITIAL_TOAST_STATE: ToastState = { items: [], nextId: 1 };

/** Longest queue kept; older waiting toasts are dropped first. */
export const TOAST_QUEUE_LIMIT = 4;

/** Problems stay up longer: they are the ones people need to read. */
export function defaultToastDuration(tone: ToastTone): number {
  return tone === "bad" || tone === "warn" ? 6000 : 4000;
}

export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "push": {
      const message = action.message.trim();
      if (!message) return state;
      const tone = action.tone ?? "ok";
      // The same message already waiting or showing is not repeated.
      if (state.items.some((t) => t.message === message && t.tone === tone)) return state;
      const toast: Toast = {
        id: state.nextId,
        message,
        tone,
        duration: action.duration ?? defaultToastDuration(tone),
      };
      let items = [...state.items, toast];
      if (items.length > TOAST_QUEUE_LIMIT) {
        // Keep the one on screen; drop the oldest waiting toast.
        items = [items[0], ...items.slice(items.length - (TOAST_QUEUE_LIMIT - 1))];
      }
      return { items, nextId: state.nextId + 1 };
    }
    case "dismiss": {
      const items = state.items.filter((t) => t.id !== action.id);
      return items.length === state.items.length ? state : { ...state, items };
    }
    case "clear":
      return state.items.length === 0 ? state : { ...state, items: [] };
  }
}

/** The toasts on screen now (the front of the queue). */
export function visibleToasts(state: ToastState, max = 1): Toast[] {
  return state.items.slice(0, Math.max(1, max));
}
