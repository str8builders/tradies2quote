"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { cx } from "./cx";
import { IconButton } from "./icon-button";
import { activateFocusTrap } from "./lib/focus-trap";
import { UI_TEXT } from "./styles";

export interface SheetPanelProps {
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  descriptionId?: string;
  /** Shows a 48 px Close button in the corner. */
  onClose?: () => void;
  closeLabel?: string;
  /** The main action, pinned under the scrolling content. */
  footer?: ReactNode;
  children?: ReactNode;
  /** "viewport" (default) caps the height at 92% of the screen; "container" at its box. */
  fit?: "viewport" | "container";
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The sheet's surface: grab handle, title, scrolling body, pinned footer.
 * <BottomSheet> wraps it in a modal dialog; the kit page also shows it inline.
 */
export function SheetPanel({
  title,
  titleId,
  description,
  descriptionId,
  onClose,
  closeLabel = "Close",
  footer,
  children,
  fit = "viewport",
  className,
  ref,
}: SheetPanelProps) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={cx(
        "relative mx-auto flex w-full max-w-xl flex-col rounded-t-ui-xl border-t border-ui-line bg-ui-surface text-ui-base shadow-ui-sheet outline-none",
        fit === "viewport" ? "max-h-[92dvh]" : "max-h-full",
        "animate-ui-sheet-in motion-reduce:animate-none",
        UI_TEXT,
        className,
      )}
    >
      <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-ui-line-strong" />
      <div className="flex items-start gap-2 pt-1 pr-2 pl-4">
        <div className="min-w-0 flex-1 pt-2.5">
          <h2 id={titleId} className="ui-title text-ui-lg text-ui-text">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-ui-sm text-ui-muted">
              {description}
            </p>
          ) : null}
        </div>
        {onClose ? <IconButton label={closeLabel} icon={<X weight="bold" />} onClick={onClose} /> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4">{children}</div>
      {footer ? (
        <div className="border-t border-ui-line px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {footer}
        </div>
      ) : (
        <div className="pb-[env(safe-area-inset-bottom)]" />
      )}
    </div>
  );
}

export interface BottomSheetProps {
  open: boolean;
  /** Called for Close, Escape, and a tap on the dimmed page. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Focus this when the sheet opens (defaults to the first control: Close). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  children?: ReactNode;
  closeLabel?: string;
}

/**
 * A modal sheet that slides up from the thumb. Built on <dialog> + showModal(),
 * so the page behind is inert and the sheet sits above everything (no z-index
 * fights), while CSS variables — and so outdoor mode — still inherit from where
 * it is placed. Focus is trapped inside, Escape and the dimmed page close it,
 * and focus goes back to whatever opened it. Page scroll is frozen meanwhile
 * (useBodyScrollLock, allowed by the mobile shell contract).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  initialFocusRef,
  footer,
  children,
  closeLabel = "Close",
}: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useBodyScrollLock(open);
  const requestClose = useEffectEvent(() => onClose());

  useEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!open || !dialog || !panel) return;
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    const release = activateFocusTrap({
      doc: document,
      container: panel,
      initialFocus: initialFocusRef?.current ?? null,
      onEscape: () => requestClose(),
    });
    return () => {
      // Close first: focus cannot return to the page while it is still inert.
      if (dialog.open) dialog.close();
      release();
    };
  }, [open, initialFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape: keep React in charge of open/closed.
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-ui-text backdrop:bg-transparent open:flex open:flex-col open:justify-end"
    >
      {open ? (
        <>
          <div
            aria-hidden="true"
            data-sheet-scrim=""
            onClick={onClose}
            className="absolute inset-0 bg-ui-scrim animate-ui-fade-in motion-reduce:animate-none"
          />
          <SheetPanel
            ref={panelRef}
            title={title}
            titleId={titleId}
            description={description}
            descriptionId={descriptionId}
            onClose={onClose}
            closeLabel={closeLabel}
            footer={footer}
          >
            {children}
          </SheetPanel>
        </>
      ) : null}
    </dialog>
  );
}
