"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { CheckCircle, Info, Warning, WarningOctagon, X } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import {
  INITIAL_TOAST_STATE,
  toastReducer,
  visibleToasts,
  type Toast,
  type ToastTone,
} from "./lib/toast-queue";
import { UI_TEXT } from "./styles";

export type { ToastTone } from "./lib/toast-queue";

export interface ToastOptions {
  tone?: ToastTone;
  /** Milliseconds on screen; problems default to longer. */
  duration?: number;
}

export interface ToastApi {
  show(message: string, options?: ToastOptions): void;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { border: string; icon: string; glyph: ReactNode }> = {
  ok: { border: "border-ui-ok", icon: "text-ui-ok", glyph: <CheckCircle weight="bold" /> },
  info: { border: "border-ui-info", icon: "text-ui-info", glyph: <Info weight="bold" /> },
  warn: { border: "border-ui-warn", icon: "text-ui-warn", glyph: <Warning weight="bold" /> },
  bad: { border: "border-ui-bad", icon: "text-ui-bad", glyph: <WarningOctagon weight="bold" /> },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const expire = useEffectEvent(() => onDismiss(toast.id));
  // The clock starts when the toast reaches the screen, not when it was queued.
  useEffect(() => {
    const timer = window.setTimeout(() => expire(), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.duration]);
  const t = TONE[toast.tone];
  return (
    <div
      data-tone={toast.tone}
      className={cx(
        "pointer-events-auto flex min-h-14 w-full max-w-md items-center gap-3 rounded-ui-lg border-2 bg-ui-surface py-1 pr-1 pl-4 text-ui-base font-semibold shadow-ui-raised",
        "animate-ui-toast-in motion-reduce:animate-none",
        UI_TEXT,
        t.border,
      )}
    >
      <span aria-hidden="true" className={cx("inline-flex shrink-0 text-[1.375rem]", t.icon)}>
        {t.glyph}
      </span>
      <p className="min-w-0 flex-1 py-2">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="ui-focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-ui-md text-[1.25rem] text-ui-muted hover:bg-ui-surface-2"
      >
        <X aria-hidden="true" weight="bold" />
      </button>
    </div>
  );
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Gap above the bottom of the screen, so toasts clear a bottom bar. */
  bottomOffset?: string;
  /** How many show at once (the rest wait). Default 1. */
  max?: number;
}

/**
 * Short confirmations ("Booked for Tue 30 Sep") above the bottom bar. The
 * region is always in the page and polite, so screen readers announce each
 * message without interrupting. No library.
 */
export function ToastProvider({ children, bottomOffset = "6rem", max = 1 }: ToastProviderProps) {
  const [state, dispatch] = useReducer(toastReducer, INITIAL_TOAST_STATE);
  const api = useMemo<ToastApi>(
    () => ({
      show: (message, options) => dispatch({ type: "push", message, ...options }),
      dismiss: (id) => dispatch({ type: "dismiss", id }),
    }),
    [],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-toast-region=""
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: `calc(env(safe-area-inset-bottom) + ${bottomOffset})` }}
      >
        {visibleToasts(state, max).map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={api.dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Raise a toast from any client component under <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() needs a <ToastProvider> above it.");
  return api;
}
