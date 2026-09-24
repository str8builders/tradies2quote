"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { Screen } from "@/components/ui/screen";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import { TopBar } from "@/components/ui/top-bar";
import { writeButtonLabel, writeHint, type WritingStep } from "./lib/copy";

/** How the top bar leaves this screen: a step back in the flow, out to Home, or not now. */
export type BackControl =
  | { kind: "step"; onBack: () => void }
  | { kind: "cancel" }
  | { kind: "locked" };

export function BackButton({ onClick, disabled = false }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="flow-back"
      className={cx(
        "ui-focus-ring inline-flex min-h-12 min-w-12 shrink-0 items-center gap-1 rounded-ui-md pr-3 pl-1 text-ui-base font-semibold",
        TAP,
        disabled ? "cursor-not-allowed text-ui-faint" : cx("text-ui-brand-text hover:bg-ui-surface-2", PRESS),
      )}
    >
      <CaretLeft aria-hidden="true" weight="bold" className="text-[1.375rem]" />
      Back
    </button>
  );
}

export interface FlowFrameProps {
  title: ReactNode;
  subtitle?: ReactNode;
  back: BackControl;
  /** Changes with every screen (and question): fades the content in and, after a move, focuses its heading. */
  screenKey: string;
  /** Move focus to the heading on arrival (not on the first page load). */
  focusOnArrival: boolean;
  children: ReactNode;
  /** The buttons at the thumb: at most one primary. */
  actions?: ReactNode;
  /** Plain words above the buttons. */
  hint?: ReactNode;
}

/**
 * One new-look screen inside the /app shell: a top bar that stays under the
 * notch, the content, and the action bar docked just above the floating
 * bottom navigation on phones (5.3rem + the home-indicator inset, the same
 * docking line as the quote page's sticky bar; see docs/mobile-shell-contract.md).
 */
export function FlowFrame({
  title,
  subtitle,
  back,
  screenKey,
  focusOnArrival,
  children,
  actions,
  hint,
}: FlowFrameProps) {
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusOnArrival) return;
    try {
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch {
      window.scrollTo(0, 0);
    }
    mainRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [screenKey, focusOnArrival]);

  return (
    <Screen data-new-quote-screen={screenKey}>
      <div className="sticky top-[env(safe-area-inset-top)] z-20 sm:static">
        <TopBar
          title={title}
          subtitle={subtitle}
          safeArea={false}
          back={back.kind === "cancel" ? { href: "/app", label: "Cancel" } : undefined}
          leading={
            back.kind === "step" ? (
              <BackButton onClick={back.onBack} />
            ) : back.kind === "locked" ? (
              <BackButton disabled />
            ) : undefined
          }
        />
      </div>
      <main
        ref={mainRef}
        key={screenKey}
        className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-5 pb-8 animate-ui-fade-in motion-reduce:animate-none"
      >
        {children}
      </main>
      {actions ? (
        <div className="sticky bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))] z-20 mt-auto sm:bottom-0">
          <BottomActionBar safeArea={false} hint={hint}>
            {actions}
          </BottomActionBar>
        </div>
      ) : null}
    </Screen>
  );
}

/**
 * A screen's heading, focused on arrival so screen readers start there.
 * "page" is the big display heading; "question" is a readable sans title for
 * a sentence-long question.
 */
export function ScreenHeading({
  children,
  description,
  id,
  size = "page",
}: {
  children: ReactNode;
  description?: ReactNode;
  id?: string;
  size?: "page" | "question";
}) {
  return (
    <div className={UI_TEXT}>
      <h2
        id={id}
        tabIndex={-1}
        data-autofocus=""
        className={cx(
          "text-ui-text outline-none",
          size === "page" ? "ui-heading text-ui-2xl" : "ui-title text-ui-xl",
        )}
      >
        {children}
      </h2>
      {description ? <p className="mt-2 text-ui-base text-ui-muted">{description}</p> : null}
    </div>
  );
}

/** The page's own error (`?error=`), shown until the next try starts. */
export function PageErrorNotice({ message, restoredNote }: { message: string; restoredNote?: string }) {
  return (
    <div role="alert" data-testid="new-quote-error">
      <Callout tone="bad" title={message}>
        {restoredNote}
      </Callout>
    </div>
  );
}

export interface TextBoxProps {
  label: string;
  labelHidden?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  rows?: number;
  readOnly?: boolean;
  testId?: string;
}

/**
 * A big text box in the kit's style: 20 px words (no zoom on iPhone focus),
 * a strong edge, the focus ring on the whole box, and plain help under it.
 */
export function TextBox({
  label,
  labelHidden = false,
  value,
  onChange,
  placeholder,
  hint,
  rows = 6,
  readOnly = false,
  testId,
}: TextBoxProps) {
  const autoId = useId();
  const id = `box${autoId.replace(/:/g, "")}`;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={UI_TEXT}>
      <label htmlFor={id} className={cx("mb-2 block text-ui-base font-semibold text-ui-text", labelHidden && "sr-only")}>
        {label}
      </label>
      <div
        className={cx(
          "ui-focus-within-ring rounded-ui-md border-2 border-ui-line-strong px-4 py-3 text-ui-lg text-ui-text",
          readOnly ? "bg-ui-surface-2" : "bg-ui-surface",
        )}
      >
        <textarea
          id={id}
          data-testid={testId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          readOnly={readOnly}
          aria-describedby={hintId}
          className="ui-input-reset block w-full resize-y"
        />
      </div>
      {hint ? (
        <p id={hintId} aria-live="polite" className="mt-2 text-ui-sm text-ui-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Seconds since this mounted, for the honest "still checking" line. */
function useSecondsSinceMount(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return seconds;
}

function WaitingHint({ step }: { step: WritingStep }) {
  const seconds = useSecondsSinceMount();
  return <span data-testid="write-hint">{writeHint(step, seconds)}</span>;
}

/** The hint above "Write my quote": why it can't go yet, or what it's waiting on. */
export function writeActionHint(step: WritingStep, notReady: string | undefined): ReactNode {
  if (step === "checking" || step === "saving") return <WaitingHint key={step} step={step} />;
  return notReady;
}

/** The one big "Write my quote" button, with its waiting states. */
export function WriteButton({
  step,
  ready,
  onWrite,
}: {
  step: WritingStep;
  ready: boolean;
  onWrite: () => void;
}) {
  const busy = step === "checking" || step === "saving";
  return (
    <Button
      fullWidth
      onClick={onWrite}
      disabled={!busy && !ready}
      loading={busy}
      loadingLabel={writeButtonLabel(step)}
      data-testid="write-quote"
    >
      {writeButtonLabel("idle")}
    </Button>
  );
}
