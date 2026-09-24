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

/** Where the tradie fixes things the new page can't: the classic editor. */
export function detailedEditorHref(quoteId: string): string {
  return `/app/quotes/preview/${quoteId}?view=classic`;
}

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

export interface FixActions {
  onFixClient: () => void;
  /** Open the first line that needs a check, if there is one. */
  onFixLines?: () => void;
  quoteId: string;
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
    return actions.onFixLines ? (
      <Button variant="secondary" fullWidth onClick={actions.onFixLines}>
        Show me the lines
      </Button>
    ) : (
      <ButtonLink href={detailedEditorHref(actions.quoteId)} variant="secondary" fullWidth>
        Open the detailed editor
      </ButtonLink>
    );
  }
  return null;
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
    return (
      <Callout
        tone="bad"
        title="Fix these before it can go"
        action={
          <div className="grid gap-2">
            {actions.onFixLines ? (
              <Button variant="secondary" fullWidth onClick={actions.onFixLines}>
                Show me the lines
              </Button>
            ) : null}
            <ButtonLink href={detailedEditorHref(actions.quoteId)} variant="secondary" fullWidth>
              Open the detailed editor
            </ButtonLink>
          </div>
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
