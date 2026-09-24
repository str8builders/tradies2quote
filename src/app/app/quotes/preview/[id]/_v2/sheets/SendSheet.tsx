"use client";

import { useState, useSyncExternalStore } from "react";
import { ChatCircleText, EnvelopeSimple, LinkSimple } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { BUSINESS_NAME_REQUIRED } from "@/lib/business-name";
import type { QuoteData } from "@/lib/quote-types";
import { deviceCanSendSms } from "@/lib/smsDeepLink";
import { channelAddress, checkSend, preferredChannel, type SendChannel, type SendCheck } from "../send-flow";
import { CopyButton } from "./clipboard";
import { DeviceHandoff, FixButton, OpenMessagesLink, SenderNotice, type FixActions } from "./sender-parts";
import { useQuoteSender, type SenderState } from "./use-quote-sender";

const noSubscription = () => () => {};

/** Whether this phone can send a text at all: a platform sender, or its own Messages app. */
export function useCanText(smsEnabled: boolean): boolean {
  const device = useSyncExternalStore(noSubscription, deviceCanSendSms, () => false);
  return smsEnabled || device;
}

/** The pre-check's problem shown before anyone taps Send. */
export function precheckNotice(check: SendCheck, channel: SendChannel): SenderState | null {
  if (check.state === "blocked") {
    return { phase: "blocked", reasons: check.reasons, message: "Some lines need fixing before this can go." };
  }
  if (check.state === "confirm") return { phase: "confirm", channel, reasons: check.reasons };
  return null;
}

function ChannelRow({
  channel,
  check,
  address,
  actions,
  showFix = true,
}: {
  channel: SendChannel;
  check: SendCheck;
  /** Where it would go, shown even while something else holds the send. */
  address: string | null;
  actions: FixActions;
  /** Off when the other channel already shows the same fix. */
  showFix?: boolean;
}) {
  const icon = channel === "email" ? <EnvelopeSimple weight="bold" /> : <ChatCircleText weight="bold" />;
  const title = channel === "email" ? "Email" : "Text message";
  if (check.state === "fix") {
    return (
      <li data-channel={channel} data-ready="false">
        <ListRow icon={icon} iconTone="warn" title={title} subtitle={check.message} />
        {showFix && check.fix ? (
          <div className="px-4 pb-4">
            <FixButton fix={check.fix} actions={actions} />
          </div>
        ) : null}
      </li>
    );
  }
  const to = (check.state === "ready" || check.state === "confirm" ? check.to : "") || address;
  return (
    <li data-channel={channel} data-ready={check.state === "blocked" ? "false" : "true"}>
      <ListRow icon={icon} iconTone="brand" title={title} subtitle={to ?? undefined} />
    </li>
  );
}

/** After it has gone: say so, and offer the client's link to share another way. */
export function SentSheet({
  who,
  channel,
  publicLink,
  onDone,
}: {
  who: string;
  channel: SendChannel;
  /** Null until the refresh after sending brings it in. */
  publicLink: string | null;
  onDone: () => void;
}) {
  return (
    <BottomSheet
      open
      onClose={onDone}
      title={`Sent to ${who}`}
      description={channel === "email" ? "They'll get an email with the quote." : "They'll get a text with the quote."}
      footer={
        <Button fullWidth data-testid="job-send-done" onClick={onDone}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <p>The link lets them see the quote and accept it. Copy it to send another way too.</p>
        {publicLink ? (
          <CopyButton text={publicLink} variant="secondary" icon={<LinkSimple weight="bold" />} failHint="Couldn't copy the link.">
            Copy the link
          </CopyButton>
        ) : (
          <Button variant="secondary" fullWidth loading loadingLabel="Getting the link…">
            Copy the link
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

export interface SendSheetProps {
  quoteId: string;
  firstName: string | null;
  status: string;
  /** The quote exactly as it will be saved before sending. */
  data: QuoteData;
  description: string | null;
  hasBusinessName: boolean;
  smsEnabled: boolean;
  /** "resend" after a no: same routes, different words. */
  mode: "send" | "resend";
  /** The client's working link; arrives with the refresh after sending. */
  publicLink: string | null;
  saveFirst: () => Promise<{ ok: true } | { error: string }>;
  /** It has gone: refresh the job (status, link). */
  onSent: (channel: SendChannel) => void;
  /** The tradie is finished with the sheet. */
  onDone: (channel: SendChannel) => void;
  onClose: () => void;
  onFixClient: () => void;
  onFixLines?: () => void;
}

/**
 * Send the quote: by email or text, through the classic send routes and the
 * classic send gate. What's missing shows before the tap, with the fix one
 * tap away; the $0-line and assumption warnings need an explicit "send it
 * anyway"; a missing business name points to Settings.
 */
export function SendSheet(props: SendSheetProps) {
  const { quoteId, firstName, data, hasBusinessName, onClose } = props;
  const canText = useCanText(props.smsEnabled);
  const [acknowledged, setAcknowledged] = useState(false);
  const [sent, setSent] = useState<SendChannel | null>(null);
  const sender = useQuoteSender({
    quoteId,
    saveFirst: props.saveFirst,
    onSent: (channel, via) => {
      props.onSent(channel);
      // A text from the tradie's own phone ends in Messages; the rest show the link.
      if (via === "device") props.onDone(channel);
      else setSent(channel);
    },
  });

  const input = { status: props.status, data, description: props.description };
  const email = checkSend("email", input);
  const text = canText ? checkSend("sms", input) : null;
  const preferred = preferredChannel(email, text);
  const other: SendChannel | null = preferred === "email" ? (text ? "sms" : null) : "email";
  const checkFor = (channel: SendChannel) => (channel === "email" ? email : text);
  const usable = (channel: SendChannel | null) => {
    const check = channel ? checkFor(channel) : null;
    return !!check && (check.state === "ready" || check.state === "confirm");
  };

  const shown =
    sender.state.phase === "idle" || sender.state.phase === "busy"
      ? precheckNotice(checkFor(preferred) ?? email, preferred)
      : sender.state;
  const needsAck = shown?.phase === "confirm";
  const blocked = shown?.phase === "blocked" || !hasBusinessName;
  const busy = sender.state.phase === "busy";
  const actions: FixActions = { quoteId, onFixClient: props.onFixClient, onFixLines: props.onFixLines };
  const who = firstName ?? "your client";

  if (sent) {
    return <SentSheet who={who} channel={sent} publicLink={props.publicLink} onDone={() => props.onDone(sent)} />;
  }

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

  const sendLabel = (channel: SendChannel) =>
    `${needsAck ? "Send anyway" : "Send"} by ${channel === "email" ? "email" : "text"}`;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={props.mode === "resend" ? `Send it to ${who} again` : `Send to ${who}`}
      description="Pick how they get it."
      footer={
        <div className="grid gap-2">
          {other && usable(other) ? (
            <Button
              variant="secondary"
              fullWidth
              disabled={blocked || (needsAck && !acknowledged) || busy}
              loading={sender.state.phase === "busy" && sender.state.channel === other}
              loadingLabel="Sending…"
              onClick={() => sender.send(other, acknowledged)}
            >
              {sendLabel(other)}
            </Button>
          ) : null}
          <Button
            fullWidth
            data-testid="job-send-primary"
            disabled={blocked || !usable(preferred) || (needsAck && !acknowledged) || busy}
            loading={sender.state.phase === "busy" && sender.state.channel === preferred}
            loadingLabel="Sending…"
            onClick={() => sender.send(preferred, acknowledged)}
          >
            {sendLabel(preferred)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!hasBusinessName ? (
          <Callout
            tone="warn"
            title="Add your business name first"
            action={
              <ButtonLink href={BUSINESS_NAME_REQUIRED.settings_url} variant="secondary" fullWidth>
                Open Settings
              </ButtonLink>
            }
          >
            It goes at the top of the quote.
          </Callout>
        ) : null}
        {shown ? (
          <SenderNotice state={shown} acknowledged={acknowledged} onAcknowledge={setAcknowledged} actions={actions} />
        ) : null}
        <Card padding="none">
          <ul className="divide-y divide-ui-line">
            <ChannelRow channel="email" check={email} address={channelAddress("email", data)} actions={actions} />
            {text ? (
              <ChannelRow
                channel="sms"
                check={text}
                address={channelAddress("sms", data)}
                actions={actions}
                showFix={!(email.state === "fix" && text.state === "fix" && email.code === text.code)}
              />
            ) : null}
          </ul>
        </Card>
      </div>
    </BottomSheet>
  );
}
