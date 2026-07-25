"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ChatCircleText,
  EnvelopeSimple,
  FloppyDisk,
  Warning,
} from "@phosphor-icons/react";
import type { QuoteStatus } from "@/lib/quote-types";
import { buildSmsHref, deviceCanSendSms } from "@/lib/smsDeepLink";

/**
 * Wave 19.10 — sticky bottom action bar.
 *
 * Replaces the end-of-page "Save changes" row + the inline Send
 * button. Always visible on mobile (fixed at the bottom safe area).
 * On md+ it lays out as a normal inline strip
 * so it doesn't squat across the desktop viewport.
 *
 * Layout (left → right):
 *   - DRAFT status pill (matches the existing `<StatusPill>` palette).
 *   - "Save changes" GHOST button (high-frequency action — listed first).
 *   - "Send quote" PRIMARY brand-orange button (lower-frequency, terminal).
 *
 * Send action POSTs to `/api/quotes/{quoteId}/send`. Logic mirrors
 * `SendQuoteButton.handleSend` but lives here so the bar is
 * self-contained. The inline `<SendQuoteButton>` is rendered with
 * `hideSendButton` so its trigger stays off the page — its link
 * affordances (PDF, public link, copy) keep their inline home for
 * sent/viewed/accepted states.
 *
 * Mobile geometry:
 *   - Sits above the mobile bottom nav, which owns
 *     `env(safe-area-inset-bottom)`.
 *   - `min-h-[56px]` per the spec.
 *   - z-50 + blur backdrop + ink-950/85 bg so scrolled content
 *     remains legible behind the bar.
 */
type Props = {
  quoteId: string;
  status: QuoteStatus;
  isPending: boolean;
  onSave: () => void | Promise<void>;
  /**
   * Async hook so the Send button can call the editor's save before
   * firing /api/quotes/{id}/send. Returns true on success.
   */
  onSaveBeforeSend: () => Promise<boolean>;
  /**
   * Server-decided: a PLATFORM sender (Twilio) is configured. Note this
   * no longer gates the button — with no platform sender the send falls
   * back to the device's own Messages app (the NZ path), which is the
   * common case. Kept so the component can tell the two apart.
   */
  smsEnabled?: boolean;
};

type SendState = "idle" | "saving" | "generating" | "sending" | "sent" | "error";

const ERROR_COPY: Record<string, string> = {
  client_name_missing: "Add a client name before sending.",
  client_email_missing: "Add the client's email address before sending.",
  client_email_invalid: "The client email doesn't look valid.",
  client_phone_missing: "Add the client's phone number before sending an SMS.",
  client_phone_invalid: "The client phone number doesn't look valid. Use +64...",
  no_line_items: "Add at least one line item before sending.",
  total_zero: "Quote total must be greater than zero.",
  already_accepted: "This quote has already been accepted.",
  pdf_generation_failed: "Could not generate the PDF.",
  pdf_upload_failed: "Could not save the PDF.",
  email_not_configured: "Email sending isn't available right now — try again shortly.",
  email_from_not_configured: "Email sending isn't available right now — try again shortly.",
  sms_not_configured: "Text sending isn't available right now — send by email instead.",
  sms_token_not_configured: "Text sending isn't available right now — send by email instead.",
  sms_from_not_configured: "Text sending isn't available right now — send by email instead.",
  update_failed: "Message sent but the quote status couldn't update.",
  takeoff_blocked: "Fix the flagged takeoff lines before sending.",
  takeoff_unconfirmed: "Review and confirm the flagged quantities before sending.",
};

/** Capability checks never change mid-session — nothing to subscribe to. */
const emptySubscribe = () => () => {};

const STATUS_PILL: Record<QuoteStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-hivis/40 bg-hivis/10 text-hivis" },
  sent: { label: "Sent", cls: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
  viewed: { label: "Viewed", cls: "border-hivis/40 bg-hivis/10 text-hivis" },
  accepted: { label: "Accepted", cls: "border-brand/40 bg-brand/10 text-brand" },
  scheduled: { label: "Scheduled", cls: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" },
  in_progress: { label: "In progress", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  completed: { label: "Completed", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  declined: { label: "Declined", cls: "border-red-500/40 bg-red-500/10 text-red-300" },
  expired: { label: "Expired", cls: "border-ink-600 bg-ink-800 text-ink-400" },
};

export function StickyActionBar({
  quoteId,
  status,
  isPending,
  onSave,
  onSaveBeforeSend,
  smsEnabled = true,
}: Props) {
  const router = useRouter();
  const [sendState, setSendState] = useState<SendState>("idle");
  const [activeChannel, setActiveChannel] = useState<"email" | "sms">("email");
  const [errorMessage, setErrorMessage] = useState("");
  // Wave 45 — takeoff safety gate (mirrors SendQuoteButton).
  const [confirmReasons, setConfirmReasons] = useState<string[] | null>(null);
  const [blockReasons, setBlockReasons] = useState<string[] | null>(null);
  // Device-SMS handoff: the composed text waiting for the tradie to open
  // Messages (see src/lib/smsDeepLink.ts). `opened` flips once they've
  // tapped through, which flips the quote to sent.
  const [smsHandoff, setSmsHandoff] = useState<{
    to: string;
    body: string;
    clientName: string;
    opened: boolean;
  } | null>(null);

  const isAccepted = status === "accepted";
  const isSentOrViewed = status === "sent" || status === "viewed";
  const sendBusy =
    sendState === "saving" ||
    sendState === "generating" ||
    sendState === "sending";

  // Whether to offer Text at all. The device check reads `navigator` /
  // the Capacitor bridge, so it's client-only: the server snapshot is
  // `false` and the client snapshot resolves on the first client render —
  // same split <HideInNativeApp> uses, so SSR and hydration agree without
  // setting state in an effect.
  const canTextDevice = useSyncExternalStore(
    emptySubscribe,
    deviceCanSendSms,
    () => false,
  );
  const canText = smsEnabled || canTextDevice;

  async function sendVia(channel: "email" | "sms", acknowledged = false) {
    setActiveChannel(channel);
    setErrorMessage("");
    setBlockReasons(null);
    if (!acknowledged) setConfirmReasons(null);
    setSendState("saving");
    const saved = await onSaveBeforeSend();
    if (!saved) {
      setErrorMessage("Could not save your latest edits.");
      setSendState("error");
      return;
    }
    setSendState("generating");
    try {
      const endpoint =
        channel === "sms"
          ? `/api/quotes/${quoteId}/sms`
          : `/api/quotes/${quoteId}/send`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acknowledged }),
        // Same stall guard as SendQuoteButton (90s ≫ legit send time).
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          reasons?: string[];
        };
        const code = data.error ?? "send_failed";
        if (code === "takeoff_unconfirmed") {
          setConfirmReasons(data.reasons ?? []);
          setSendState("idle");
          return;
        }
        if (code === "takeoff_blocked") {
          setBlockReasons(data.reasons ?? []);
          setErrorMessage(
            data.message ?? ERROR_COPY[code] ?? "Fix the flagged lines before sending.",
          );
          setSendState("error");
          return;
        }
        setErrorMessage(
          data.message ?? ERROR_COPY[code] ?? "Could not send the quote.",
        );
        setSendState("error");
        return;
      }
      setConfirmReasons(null);

      // Device-SMS path: nothing has been sent yet — the server minted the
      // PDF + public link and handed back the text. Surface the handoff
      // panel instead of claiming "sent".
      const payload = (await res.json().catch(() => ({}))) as {
        mode?: string;
        to?: string;
        body?: string;
        client_name?: string;
      };
      if (payload.mode === "device" && payload.to && payload.body) {
        setSmsHandoff({
          to: payload.to,
          body: payload.body,
          clientName: payload.client_name ?? "your client",
          opened: false,
        });
        setSendState("idle");
        return;
      }

      setSendState("sent");
      router.refresh();
    } catch {
      setErrorMessage("Network error. Please try again.");
      setSendState("error");
    }
  }

  /**
   * Flip the quote to `sent` the instant the tradie hands the link to
   * Messages. This is THE fix for the "Quote not found" bug: a token on a
   * still-`draft` quote renders not-found to the client, so status must move
   * the moment the link leaves the tradie's hands — not on a later "Mark as
   * sent" tap they usually never return to make.
   *
   * Fire-and-forget + keepalive, and NEVER awaited before the sms: href
   * navigates — awaiting first makes iOS WKWebView swallow the Messages open.
   * A rare no-send is recoverable (decline from the LifecycleCard).
   */
  function markSentOnHandoff() {
    void fetch(`/api/quotes/${quoteId}/sms/sent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trigger: "opened_messages" }),
      keepalive: true,
    }).catch(() => {});
  }

  const handleSend = () => sendVia("email");
  const handleSendSms = () => sendVia("sms");

  const pill = STATUS_PILL[status] ?? STATUS_PILL.draft;

  return (
    <>
      {/* Inline error / sent message — anchored ABOVE the bar so it
          doesn't clip into the action row on a narrow phone.
          Wave 36 — solid backgrounds (was bg-red-500/10 + bg-brand/10
          which are mostly transparent and blended into the cream
          light-mode page behind, making the banner look like it was
          overlapping the metadata grid). Solid red / solid brand reads
          as a real banner on both themes and never bleeds. */}
      {(sendState === "error" || sendState === "sent") && (
        <div
          aria-live="polite"
          className="fixed inset-x-0 bottom-[180px] z-50 mx-auto max-w-3xl px-4 sm:static sm:bottom-auto sm:max-w-none sm:px-0"
        >
          <p
            data-testid={
              sendState === "error" ? "sticky-send-error" : "sticky-send-ok"
            }
            className={`rounded-sm border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] shadow-lg ${
              sendState === "error"
                ? "border-red-600 bg-red-600 text-white"
                : "border-brand bg-brand text-ink-900"
            }`}
          >
            {sendState === "error"
              ? errorMessage
              : activeChannel === "sms"
                ? "// sms sent"
                : "// quote sent"}
          </p>
        </div>
      )}

      {blockReasons && blockReasons.length > 0 && (
        <div
          aria-live="polite"
          className="fixed inset-x-0 bottom-[180px] z-50 mx-auto max-w-3xl px-4 sm:static sm:bottom-auto sm:max-w-none sm:px-0 sm:mb-2"
        >
          <div
            data-testid="sticky-send-blocked"
            className="rounded-sm border border-red-500/60 bg-ink-950 p-3 shadow-lg"
          >
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-red-300">
              <Warning size={14} weight="fill" />
              {"// can't send yet"}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-100">
              {blockReasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 text-red-300">→</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {confirmReasons && (
        <div
          aria-live="polite"
          className="fixed inset-x-0 bottom-[180px] z-50 mx-auto max-w-3xl px-4 sm:static sm:bottom-auto sm:max-w-none sm:px-0 sm:mb-2"
        >
          <div
            data-testid="sticky-send-confirm"
            className="rounded-sm border border-hivis/60 bg-ink-950 p-3 shadow-lg"
          >
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
              <Warning size={14} weight="fill" />
              {"// confirm before sending"}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-100">
              {confirmReasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 text-hivis">→</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                data-testid="sticky-send-confirm-button"
                onClick={() => sendVia(activeChannel, true)}
                className="t2q-btn-primary-pro min-h-[44px] !px-4 !text-[11px]"
              >
                Confirm &amp; send {activeChannel === "sms" ? "text" : "email"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmReasons(null)}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-ink-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device-SMS handoff. Two steps on purpose: the sms: scheme needs a
          real tap to open reliably in WKWebView (an async fetch loses the
          original gesture), and it lets the tradie read the text before it
          hits their Messages app. Tapping "Open Messages" flips the quote to
          `sent` (the link is now live for the client), then the second step
          is just an acknowledgement — no separate status action. */}
      {smsHandoff && (
        <div
          data-testid="sms-handoff"
          className="fixed inset-x-0 bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))] z-50 px-3 sm:static sm:px-0 sm:pb-4"
        >
          <div className="mx-auto max-w-3xl rounded-xl border border-brand/40 bg-ink-950/95 p-3.5 shadow-[0_-6px_24px_-10px_rgba(0,0,0,0.7)] backdrop-blur-md sm:p-4">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
              <ChatCircleText size={14} weight="bold" />
              {smsHandoff.opened
                ? "// marked sent"
                : `// text ready for ${smsHandoff.clientName}`}
            </p>

            {!smsHandoff.opened && (
              <p className="mt-2 rounded-sm border border-ink-700 bg-ink-900 p-2.5 text-xs leading-relaxed text-ink-200">
                {smsHandoff.body}
              </p>
            )}

            <p className="mt-2 text-xs text-ink-400">
              {smsHandoff.opened
                ? "The quote is now marked sent and the link is live for your client. Didn't actually send it? You can decline the quote below."
                : "Opens your Messages app with this ready to go — it sends from your own number, so your client can just reply."}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!smsHandoff.opened ? (
                <a
                  href={buildSmsHref(smsHandoff.to, smsHandoff.body)}
                  data-testid="sms-handoff-open"
                  onClick={() => {
                    // Flip to `sent` at hand-off (non-awaited — the tap must
                    // reach the sms: href), then move to the acknowledgement
                    // step.
                    markSentOnHandoff();
                    setSmsHandoff((h) => (h ? { ...h, opened: true } : h));
                  }}
                  className="t2q-btn-primary-pro min-h-[44px] !px-4 !text-[11px]"
                >
                  <ChatCircleText size={16} weight="bold" />
                  Open Messages
                </a>
              ) : (
                <button
                  type="button"
                  data-testid="sms-handoff-done"
                  onClick={() => {
                    // Re-ensure the flip: if the fire-and-forget POST on
                    // "Open Messages" was dropped, this guarantees the quote
                    // is sent (the route is idempotent, so a second call is a
                    // no-op). Closes the "dropped request -> stuck draft ->
                    // dead link" gap without a duplicate audit row.
                    markSentOnHandoff();
                    setSmsHandoff(null);
                    setSendState("sent");
                    router.refresh();
                  }}
                  className="t2q-btn-primary-pro min-h-[44px] !px-4 !text-[11px]"
                >
                  Done
                </button>
              )}
              {!smsHandoff.opened && (
                <button
                  type="button"
                  data-testid="sms-handoff-cancel"
                  onClick={() => setSmsHandoff(null)}
                  className="min-h-[44px] px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-ink-100"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        data-testid="sticky-action-bar"
        className={[
          // Docks directly above the floating island nav: island claims
          // 4.9rem + inset, +0.4rem gap = 5.3rem (see globals.css contract).
          "fixed left-0 right-0 bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))] z-40 border-t border-ink-800 bg-ink-950/90 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md",
          // min height 56 per the spec — leaves room for 44-px buttons.
          "min-h-[56px]",
          // On sm+ become a normal inline strip, no fixed positioning.
          "sm:static sm:left-auto sm:right-auto sm:border-0 sm:bg-transparent sm:shadow-none",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2 sm:justify-between sm:px-0 sm:py-4 sm:border-t sm:border-ink-700">
          {/* Status pill hidden on mobile — the same pill is rendered
              inside the page above, and the third action button (SMS)
              left no horizontal room. Shows again from sm: upward. */}
          <span
            data-testid="sticky-status-pill"
            className={`hidden sm:inline-flex shrink-0 items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${pill.cls}`}
          >
            {pill.label}
          </span>

          {/* Mobile: short labels ALWAYS visible next to each icon so
              the tradie reads "Save / Email / Text" at a glance instead
              of decoding 3 similar-looking icons. Earlier icon-only
              treatment hit a clarity problem (user feedback: "tradies
              don't know what's what"). Labels are short — "Text"
              instead of "SMS" because that's what NZ tradies actually
              call it. min-h-[44px] keeps the iOS tap-target spec. */}
          <div className="flex flex-1 items-center justify-end gap-1.5 sm:flex-none sm:gap-2">
            <button
              type="button"
              data-testid="sticky-save-changes"
              onClick={onSave}
              disabled={isPending || isAccepted}
              title={isAccepted ? "Quote already accepted." : "Save changes"}
              className="t2q-btn-ghost-pro min-h-[44px] flex-1 !px-2 sm:flex-none sm:!px-7 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FloppyDisk size={16} weight="bold" className="shrink-0" />
              <span>{isPending ? "Saving" : "Save"}</span>
              <span className="hidden sm:inline">{isPending ? "…" : " changes"}</span>
            </button>

            {!isAccepted && (
              <>
                <button
                  type="button"
                  data-testid="sticky-send-button"
                  onClick={handleSend}
                  disabled={sendBusy || isPending}
                  title={
                    sendBusy && activeChannel === "email"
                      ? "Sending email…"
                      : isSentOrViewed
                        ? "Resend email"
                        : "Send email"
                  }
                  className="t2q-btn-primary-pro min-h-[44px] flex-1 !px-2 sm:flex-none sm:!px-7 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <EnvelopeSimple size={16} weight="bold" className="shrink-0" />
                  <span>
                    {sendBusy && activeChannel === "email"
                      ? "Sending"
                      : isSentOrViewed
                        ? "Resend"
                        : "Email"}
                  </span>
                </button>
                {/* Text renders when SOMETHING can actually send: either a
                    platform sender (Twilio, server-decided) or this device's
                    own Messages app. On desktop — no Messages app, no Twilio
                    — it stays hidden rather than opening a dead sms: scheme.
                    A visible button whose only outcome is an error is a
                    Guideline 2.1 rejection waiting to happen. */}
                {canText && (
                  <button
                    type="button"
                    data-testid="sticky-send-sms-button"
                    onClick={handleSendSms}
                    disabled={sendBusy || isPending}
                    aria-label={
                      sendBusy && activeChannel === "sms"
                        ? "Sending text"
                        : isSentOrViewed
                          ? "Resend text"
                          : "Send text"
                    }
                    title={
                      sendBusy && activeChannel === "sms"
                        ? "Sending text…"
                        : isSentOrViewed
                          ? "Resend text"
                          : "Send text"
                    }
                    className="t2q-btn-ghost-pro min-h-[44px] flex-1 !px-2 sm:flex-none sm:!px-7 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChatCircleText size={16} weight="bold" className="shrink-0" />
                    <span>
                      {sendBusy && activeChannel === "sms"
                        ? "Sending"
                        : isSentOrViewed
                          ? "Resend"
                          : "Text"}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
