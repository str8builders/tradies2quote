"use client";

import { ChatCircleText } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { BUSINESS_NAME_REQUIRED } from "@/lib/business-name";
import { buildSmsHref } from "@/lib/smsDeepLink";
import { plainReason, type SendFix } from "../send-flow";
import type { SenderState } from "./use-quote-sender";

export function ReasonList({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5">
      {reasons.map((reason, i) => (
        <li key={`${i}-${reason}`}>{plainReason(reason)}</li>
      ))}
    </ul>
  );
}

/**
 * The job page's fixes for what stops a quote going. Each one is there only
 * when that problem is on the quote, so the send screen offers exactly the
 * buttons that help.
 */
export interface SendFixes {
  /** No line needs a check (no lines, or a $0 total): add a line, or price the ones there. */
  onAddLines?: { label: string; onClick: () => void };
  /** Confirm the sizes read off the drawing. */
  onFixSizes?: () => void;
  /** Check the lines against the supplier's quote they came from. */
  onFixSupplier?: () => void;
  /** Work the materials out again from the wall's measurements (a failed quantity check). */
  onFixMeasurements?: () => void;
  /** Nothing above applies: back to the job to change the lines named. */
  onBackToJob?: () => void;
}

export interface FixActions extends SendFixes {
  onFixClient: () => void;
  /** Open the first line that needs a check, if there is one. */
  onFixLines?: () => void;
}

/** The button that fixes a send problem, in plain words. */
export function FixButton({ fix, actions }: { fix: SendFix; actions: FixActions }) {
  if (fix === "client") {
    return (
      <Button variant="secondary" fullWidth onClick={actions.onFixClient}>
        Edit the client
      </Button>
    );
  }
  if (fix === "settings") {
    return (
      <ButtonLink href={BUSINESS_NAME_REQUIRED.settings_url} variant="secondary" fullWidth>
        Open Settings
      </ButtonLink>
    );
  }
  if (fix === "lines") {
    if (actions.onFixLines) {
      return (
        <Button variant="secondary" fullWidth onClick={actions.onFixLines}>
          Show me the lines
        </Button>
      );
    }
    if (actions.onAddLines) {
      return (
        <Button variant="secondary" fullWidth onClick={actions.onAddLines.onClick}>
          {actions.onAddLines.label}
        </Button>
      );
    }
  }
  return null;
}

type BlockedFix = { key: string; label: string; onClick: () => void };

/**
 * The buttons under "Fix these before it can go": one for each problem on
 * the quote, in the order the tradie would fix them; "Back to the job" only
 * when none of them applies.
 */
export function blockedFixes(actions: FixActions): BlockedFix[] {
  const fixes: Array<BlockedFix | null> = [
    actions.onFixLines ? { key: "lines", label: "Show me the lines", onClick: actions.onFixLines } : null,
    actions.onFixSizes ? { key: "sizes", label: "Check the sizes", onClick: actions.onFixSizes } : null,
    actions.onFixSupplier
      ? { key: "supplier", label: "Check against the supplier's quote", onClick: actions.onFixSupplier }
      : null,
    actions.onFixMeasurements
      ? { key: "measurements", label: "Change the measurements", onClick: actions.onFixMeasurements }
      : null,
  ];
  const found = fixes.filter((fix): fix is BlockedFix => fix !== null);
  if (found.length === 0 && actions.onBackToJob) {
    return [{ key: "job", label: "Back to the job", onClick: actions.onBackToJob }];
  }
  return found;
}

/** What the send routes said: confirm first, can't go yet, or an error. */
export function SenderNotice({
  state,
  acknowledged,
  onAcknowledge,
  actions,
}: {
  state: SenderState;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  actions: FixActions;
}) {
  if (state.phase === "confirm") {
    return (
      <Callout tone="warn" title="Check these before you send">
        <ReasonList reasons={state.reasons} />
        <Toggle
          className="mt-3"
          checked={acknowledged}
          onChange={onAcknowledge}
          label="I've checked these. Send it anyway."
          showState={false}
        />
      </Callout>
    );
  }
  if (state.phase === "blocked") {
    const fixes = blockedFixes(actions);
    return (
      <Callout
        tone="bad"
        title="Fix these before it can go"
        action={
          fixes.length > 0 ? (
            <div className="grid gap-2">
              {fixes.map((fix) => (
                <Button key={fix.key} variant="secondary" fullWidth data-fix={fix.key} onClick={fix.onClick}>
                  {fix.label}
                </Button>
              ))}
            </div>
          ) : undefined
        }
      >
        <ReasonList reasons={state.reasons} />
      </Callout>
    );
  }
  if (state.phase === "error") {
    return (
      <div role="alert">
        <Callout
          tone="bad"
          title={state.message}
          action={state.fix ? <FixButton fix={state.fix} actions={actions} /> : undefined}
        />
      </div>
    );
  }
  return null;
}

/** The text-message handover: read it, open Messages, then say it's done. */
export function DeviceHandoff({ state }: { state: Extract<SenderState, { phase: "device" }> }) {
  if (state.opened) {
    return (
      <p>
        The quote is marked as sent and the link now works for {state.clientName}. Didn&apos;t send the text? You can
        send it again from the job.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-ui-muted">It opens your Messages app ready to go. It sends from your own number, so they can reply.</p>
      <Card className="whitespace-pre-line break-words">{state.body}</Card>
    </div>
  );
}

/** "Open Messages": a real link, so the phone's tap opens the app reliably. */
export function OpenMessagesLink({
  state,
  onOpened,
}: {
  state: Extract<SenderState, { phase: "device" }>;
  onOpened: () => void;
}) {
  return (
    <a
      href={buildSmsHref(state.to, state.body)}
      onClick={onOpened}
      data-testid="job-open-messages"
      className={buttonClasses({ fullWidth: true })}
    >
      <ChatCircleText aria-hidden="true" weight="bold" className="text-[1.15em]" />
      Open Messages
    </a>
  );
}
