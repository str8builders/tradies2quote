"use client";

import { useState } from "react";
import { ChatCircleText, Copy, EnvelopeSimple, LinkSimple } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { QuoteData } from "@/lib/quote-types";
import { buildSmsHref } from "@/lib/smsDeepLink";
import { reminderText } from "../contact";
import { textableNumber, type SendChannel } from "../send-flow";
import { CopyButton } from "./clipboard";
import { useCanText } from "./SendSheet";
import { DeviceHandoff, OpenMessagesLink, SenderNotice, type FixActions } from "./sender-parts";
import { useQuoteSender } from "./use-quote-sender";

export interface ReminderSheetProps {
  quoteId: string;
  firstName: string | null;
  data: QuoteData;
  /** The Follow-up Agent's message for now ("Friendly reminder"). */
  reminder: { label: string; body: string } | null;
  publicLink: string | null;
  sentOn: string | null;
  saveFirst: () => Promise<{ ok: true } | { error: string }>;
  onSent: (channel: SendChannel) => void;
  onClose: () => void;
  onFixClient: () => void;
  onFixLines?: () => void;
}

/**
 * Nudge a client who hasn't answered: the Follow-up Agent's message with the
 * quote link, texted from the tradie's own phone (nothing is recorded, like
 * copying it), or the quote emailed again through the classic resend path.
 */
export function ReminderSheet(props: ReminderSheetProps) {
  const { quoteId, firstName, data, reminder, publicLink, onClose } = props;
  const toast = useToast();
  const canText = useCanText(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const sender = useQuoteSender({ quoteId, saveFirst: props.saveFirst, onSent: (channel) => props.onSent(channel) });
  const who = firstName ?? "your client";
  const message = reminder ? reminderText(reminder.body, publicLink) : null;
  const phone = textableNumber(data.client?.phone);
  const hasEmail = !!(data.client?.email ?? "").trim();
  const actions: FixActions = { quoteId, onFixClient: props.onFixClient, onFixLines: props.onFixLines };
  const busy = sender.state.phase === "busy";

  if (sender.state.phase === "device") {
    const device = sender.state;
    return (
      <BottomSheet
        open
        // Once Messages has opened the quote is marked sent: closing = done.
        onClose={device.opened ? sender.finishText : onClose}
        title={device.opened ? "Did it send?" : `Text ready for ${firstName ?? device.clientName}`}
        footer={
          device.opened ? (
            <Button fullWidth onClick={sender.finishText}>
              Done
            </Button>
          ) : (
            <OpenMessagesLink state={device} onOpened={sender.openedMessages} />
          )
        }
      >
        <DeviceHandoff state={device} />
      </BottomSheet>
    );
  }

  const textIt = canText && phone && message;
  const needsAck = sender.state.phase === "confirm";
  const emailButton = (variant: "primary" | "secondary") => (
    <Button
      variant={variant}
      fullWidth
      data-testid="job-remind-email"
      icon={<EnvelopeSimple weight="bold" />}
      disabled={!hasEmail || (needsAck && !acknowledged)}
      loading={busy}
      loadingLabel="Sending…"
      onClick={() => sender.send("email", acknowledged)}
    >
      {needsAck ? "Email it anyway" : "Email the quote again"}
    </Button>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Send a reminder"
      description={props.sentOn ? `Sent ${props.sentOn}. A friendly nudge often gets a yes.` : "A friendly nudge often gets a yes."}
      footer={
        <div className="grid gap-2">
          {textIt ? emailButton("secondary") : null}
          {textIt ? (
            <a
              href={buildSmsHref(phone, message)}
              data-testid="job-remind-text"
              onClick={() => {
                // Let the tap open Messages first, then tidy the sheet away.
                window.setTimeout(() => {
                  toast.show(`Reminder ready in Messages for ${who}`, { tone: "info" });
                  onClose();
                }, 400);
              }}
              className={buttonClasses({ fullWidth: true })}
            >
              <ChatCircleText aria-hidden="true" weight="bold" className="text-[1.15em]" />
              Text it to {who}
            </a>
          ) : (
            emailButton("primary")
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <SenderNotice state={sender.state} acknowledged={acknowledged} onAcknowledge={setAcknowledged} actions={actions} />
        {message ? (
          <>
            <Card className="whitespace-pre-line break-words">{message}</Card>
            <div className="grid gap-2 sm:grid-cols-2">
              <CopyButton text={message} icon={<Copy weight="bold" />} failHint="Couldn't copy. Press and hold the message to copy it.">
                Copy the message
              </CopyButton>
              {publicLink ? (
                <CopyButton text={publicLink} icon={<LinkSimple weight="bold" />} failHint="Couldn't copy the link.">
                  Copy the link
                </CopyButton>
              ) : null}
            </div>
          </>
        ) : null}
        {!hasEmail ? (
          <p className="text-ui-sm text-ui-muted">
            There&apos;s no email address for {who}, so the quote can&apos;t be emailed again.
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
