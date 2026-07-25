"use client";

import { useState } from "react";
import { CheckCircle, ClipboardText } from "@phosphor-icons/react";
import { isNativeIOSApp } from "@/lib/native-app";
import type { QuoteLineItem } from "@/lib/quote-types";

type Props = {
  items: QuoteLineItem[];
  /** One-line job description for the list header, when present. */
  jobSummary?: string | null;
};

/** "225.72" → "225.72", "13" → "13" — no trailing ".00" noise on whole counts. */
function formatQty(q: unknown): string {
  const n = Number(q) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Build the plain-text materials list — quantities only, deliberately NO
 * prices. This is the takeoff a tradie reads out (or shares) at the
 * merchant counter; costs are the merchant's side of that conversation.
 */
export function buildMaterialsListText(
  items: QuoteLineItem[],
  jobSummary?: string | null,
): string {
  const materials = items.filter((it) => it.type !== "labour");
  const lines = materials.map(
    (it) => `• ${formatQty(it.quantity)} ${it.unit} — ${it.description}`,
  );
  return [
    "Materials list",
    ...(jobSummary ? [jobSummary] : []),
    "",
    ...lines,
  ].join("\n");
}

/**
 * Share / copy the quote's materials as a plain no-prices list.
 *
 * Native iOS shell: WKWebView's `navigator.share` is a no-op, so bridge to
 * the real share sheet via Capacitor (dynamic import — the plugin chunk
 * never loads on the web). Web: native share sheet when available, else
 * clipboard. Mirrors SavePdfButton's tiered approach.
 */
export function MaterialsListButton({ items, jobSummary }: Props) {
  const [state, setState] = useState<"idle" | "done">("idle");

  const materialCount = items.filter((it) => it.type !== "labour").length;
  if (materialCount === 0) return null;

  async function onShare() {
    const text = buildMaterialsListText(items, jobSummary);
    try {
      if (isNativeIOSApp()) {
        const { Share } = await import("@capacitor/share");
        try {
          await Share.share({ title: "Materials list", text });
          setState("done");
        } catch {
          // Sheet dismissed — not an error.
        }
        return;
      }
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        try {
          await navigator.share({ title: "Materials list", text });
          setState("done");
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          // Share unsupported for text here — fall through to clipboard.
        }
      }
      await navigator.clipboard.writeText(text);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      console.error("MaterialsListButton failed", e);
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      data-testid="materials-list-button"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-sm border border-ink-700 bg-ink-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-200 hover:border-brand hover:text-brand"
    >
      {state === "done" ? (
        <CheckCircle size={12} weight="bold" />
      ) : (
        <ClipboardText size={12} weight="bold" />
      )}
      {state === "done" ? "Copied" : "Copy materials list"}
    </button>
  );
}
