"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkle } from "@phosphor-icons/react";

/**
 * Recovery for a request whose automatic generation never finished (server
 * restart mid-run, provider outage, daily cap). Uses the tradie's own
 * generate route, so it behaves exactly like tapping Generate on the draft.
 */
export function GenerateRequestButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: quoteId }),
        signal: AbortSignal.timeout(180_000),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok && res.status !== 409) {
        setError(data.error || "Couldn't generate the draft. Open it and try again.");
        return;
      }
      // Another request is already writing it (e.g. the automatic run).
      if (data.code === "generation_in_progress") setNote(data.error || "Already being written.");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="request-generate"
        className="t2q-btn-ghost-pro disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void generate()}
        disabled={busy}
      >
        <Sparkle size={16} weight="fill" />
        {busy ? "Generating…" : "Generate draft now"}
      </button>
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
      {note ? <span className="text-xs text-ink-300">{note}</span> : null}
    </div>
  );
}
