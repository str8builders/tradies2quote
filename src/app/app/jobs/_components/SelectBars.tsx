"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { ArrowCounterClockwise, Trash } from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { Callout, type CalloutTone } from "@/components/ui/callout";
import { countOf } from "../../_v2/lib/dates";
import { JOBS_ACTION_LIMIT } from "../../_v2/lib/job-board";

/**
 * Where the Jobs list's own bars dock on a phone: just above the bottom tab
 * bar, at the height the mobile shell gives fixed bars (5.3rem + the
 * home-indicator inset, see AppNav). From `sm` up there is no bottom bar.
 */
const DOCK = "fixed inset-x-0 bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))] z-30";

/**
 * Select mode's one action, at the thumb: "Delete 3 jobs" on the list,
 * "Restore 3" in Recently deleted.
 */
export function SelectBar({
  count,
  action,
  busy = false,
  error = null,
  atLimit = false,
  onAction,
}: {
  count: number;
  action: "delete" | "restore";
  busy?: boolean;
  /** The last try failed: why, in plain words, above the button. */
  error?: string | null;
  /** The most one go takes is picked: say so. */
  atLimit?: boolean;
  onAction: () => void;
}) {
  return (
    <div
      data-testid="jobs-select-bar"
      className={`${DOCK} animate-ui-toast-in motion-reduce:animate-none sm:bottom-0 sm:bg-ui-bg sm:pb-[env(safe-area-inset-bottom)]`}
    >
      <BottomActionBar
        safeArea={false}
        hint={atLimit ? `That's the most you can do at once (${JOBS_ACTION_LIMIT}).` : undefined}
      >
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
        {action === "delete" ? (
          <Button
            variant="danger"
            fullWidth
            icon={<Trash weight="bold" />}
            disabled={busy}
            onClick={onAction}
            data-testid="jobs-delete"
          >
            {`Delete ${countOf(count, "job")}`}
          </Button>
        ) : (
          <Button
            fullWidth
            icon={<ArrowCounterClockwise weight="bold" />}
            loading={busy}
            loadingLabel="Restoring…"
            onClick={onAction}
            data-testid="jobs-restore"
          >
            {`Restore ${count}`}
          </Button>
        )}
      </BottomActionBar>
    </div>
  );
}

export interface JobsNoticeData {
  /** New for every message, so the same words twice still restart the clock. */
  id: number;
  tone: CalloutTone;
  message: string;
  /** Jobs the Undo button brings back. */
  undo?: readonly string[];
}

/** How long a message stays when nobody is using it. */
export const NOTICE_MS = 10_000;

/**
 * A short message after a delete or restore ("3 jobs deleted"), with Undo
 * after a delete. Docked where the select bar was. The live region is
 * always in the page so screen readers announce each message; it goes by
 * itself after NOTICE_MS unless one of its buttons has focus.
 */
export function JobsNotice({
  notice,
  busy = false,
  onUndo,
  onDismiss,
}: {
  notice: JobsNoticeData | null;
  busy?: boolean;
  onUndo: (ids: readonly string[]) => void;
  onDismiss: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const expire = useEffectEvent(() => {
    const active = document.activeElement;
    if (busy || (active && box.current?.contains(active))) return;
    onDismiss();
  });
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => expire(), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const undo = notice?.undo;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="jobs-notice"
      className={`${DOCK} pointer-events-none px-4 sm:bottom-[calc(env(safe-area-inset-bottom)+1rem)]`}
    >
      {notice ? (
        <div
          ref={box}
          key={notice.id}
          className="pointer-events-auto mx-auto max-w-xl rounded-ui-lg shadow-ui-raised animate-ui-toast-in motion-reduce:animate-none"
        >
          <Callout
            tone={notice.tone}
            title={notice.message}
            action={
              <div className="flex flex-wrap gap-2">
                {undo ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowCounterClockwise weight="bold" />}
                    loading={busy}
                    loadingLabel="Undoing…"
                    onClick={() => onUndo(undo)}
                    data-testid="jobs-undo"
                  >
                    Undo
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
                  OK
                </Button>
              </div>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
