"use client";

import { useState } from "react";
import { readSendResponse, type SendChannel, type SendFix } from "../send-flow";

export type SenderState =
  | { phase: "idle" }
  | { phase: "busy"; channel: SendChannel }
  /** The gate wants these confirmed ($0 lines, assumptions) before it goes. */
  | { phase: "confirm"; channel: SendChannel; reasons: string[] }
  | { phase: "blocked"; reasons: string[]; message: string }
  | { phase: "error"; message: string; fix: SendFix }
  /** A text ready for the tradie's own Messages app (the NZ path). */
  | { phase: "device"; to: string; body: string; clientName: string; opened: boolean };

type SaveFirst = () => Promise<{ ok: true } | { error: string }>;

/**
 * Sends the quote through the classic routes, exactly as StickyActionBar
 * does: save the latest edits first, POST /api/quotes/[id]/send or /sms with
 * the acknowledgement, and for a text from the tradie's own phone hand over
 * to Messages and mark it sent through /sms/sent.
 */
export function useQuoteSender({
  quoteId,
  saveFirst,
  onSent,
}: {
  quoteId: string;
  saveFirst: SaveFirst;
  /** "route": the send route sent it. "device": the tradie's own Messages app did. */
  onSent: (channel: SendChannel, via: "route" | "device") => void;
}) {
  const [state, setState] = useState<SenderState>({ phase: "idle" });

  async function send(channel: SendChannel, acknowledged = false) {
    setState({ phase: "busy", channel });
    const saved = await saveFirst();
    if ("error" in saved) {
      setState({ phase: "error", message: saved.error, fix: null });
      return;
    }
    try {
      const res = await fetch(channel === "sms" ? `/api/quotes/${quoteId}/sms` : `/api/quotes/${quoteId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acknowledged }),
        // Making the PDF and sending can take ~20 s; this only catches a stall.
        signal: AbortSignal.timeout(90_000),
      });
      const body: unknown = await res.json().catch(() => ({}));
      const outcome = readSendResponse(channel, res.ok, body);
      switch (outcome.kind) {
        case "sent":
          setState({ phase: "idle" });
          onSent(channel, "route");
          return;
        case "device":
          setState({ phase: "device", to: outcome.to, body: outcome.body, clientName: outcome.clientName, opened: false });
          return;
        case "confirm":
          setState({ phase: "confirm", channel, reasons: outcome.reasons });
          return;
        case "blocked":
          setState({ phase: "blocked", reasons: outcome.reasons, message: outcome.message });
          return;
        case "error":
          setState({ phase: "error", message: outcome.message, fix: outcome.fix });
          return;
      }
    } catch {
      setState({ phase: "error", message: "No connection. Check your signal and try again.", fix: null });
    }
  }

  /**
   * The link is live the moment it leaves the tradie's hands, so mark the
   * quote sent on the tap that opens Messages. Fire-and-forget with
   * keepalive, never awaited: awaiting first makes iOS drop the sms: open.
   * The route is idempotent, so "Done" repeats it safely.
   */
  function markTextSent() {
    void fetch(`/api/quotes/${quoteId}/sms/sent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trigger: "opened_messages" }),
      keepalive: true,
    }).catch(() => {});
  }

  function openedMessages() {
    markTextSent();
    setState((s) => (s.phase === "device" ? { ...s, opened: true } : s));
  }

  function finishText() {
    markTextSent();
    setState({ phase: "idle" });
    onSent("sms", "device");
  }

  function reset() {
    setState({ phase: "idle" });
  }

  return { state, send, openedMessages, finishText, reset };
}
