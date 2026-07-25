"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Prohibit, ChatCircle } from "@phosphor-icons/react";

/**
 * Tradie-side Guideline 1.2 controls for the public customer chat:
 *   - Turn chat off / back on for this quote link ("block" — the customer
 *     is an anonymous token-holder, so per-quote disable is the block).
 *   - Report the conversation to the T2Q operator (reviewed within 24h).
 *
 * Mounted at the top of <CustomerChatPanel>. Server enforcement lives in
 * /api/quote/[token]/chat (403 when disabled); this UI drives
 * /api/quotes/[id]/chat/moderate.
 */
export function ChatModerationControls({
  quoteId,
  chatDisabled,
}: {
  quoteId: string;
  chatDisabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "disable" | "enable" | "report") {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/chat/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("request failed");
      if (action === "report") setReported(true);
      else router.refresh();
    } catch {
      setError("Couldn't update the chat — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-testid="chat-moderation-controls"
      className="flex flex-wrap items-center gap-2"
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => call(chatDisabled ? "enable" : "disable")}
        data-testid="chat-toggle-disabled"
        className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] disabled:opacity-60 ${
          chatDisabled
            ? "border-brand/50 text-brand hover:bg-brand/10"
            : "border-ink-700 text-ink-300 hover:border-red-500/60 hover:text-red-200"
        }`}
      >
        {chatDisabled ? (
          <>
            <ChatCircle size={12} weight="bold" aria-hidden="true" />
            Turn chat on
          </>
        ) : (
          <>
            <Prohibit size={12} weight="bold" aria-hidden="true" />
            Turn chat off
          </>
        )}
      </button>
      <button
        type="button"
        disabled={pending || reported}
        onClick={() => call("report")}
        data-testid="chat-report-tradie"
        className="inline-flex items-center gap-1.5 rounded-sm border border-ink-700 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300 hover:border-hivis/60 hover:text-hivis disabled:opacity-60"
      >
        <Flag size={12} weight="bold" aria-hidden="true" />
        {reported ? "Reported ✓" : "Report chat"}
      </button>
      {chatDisabled ? (
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
          {"// customers can't send messages on this quote"}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
