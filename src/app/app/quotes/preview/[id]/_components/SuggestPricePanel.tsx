"use client";

import { useState } from "react";
import { Check, Sparkle, Warning } from "@phosphor-icons/react/dist/ssr";
import type { SuggestPriceResult } from "@/lib/agents/suggestPrice";
import { saveSuggestedMaterial } from "../actions";

type Props = {
  line: { description: string; quantity: number; unit: string | null };
  /** Apply the suggested price to this quote line (client state only). */
  onUseOnce: (price: number) => void;
  /** After saving to the library, also apply the price to the line. */
  onSavedAndApply: (price: number) => void;
};

type Phase = "idle" | "loading" | "result" | "error";

function money(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

function confTone(c: string): string {
  return c === "high"
    ? "text-brand"
    : c === "medium"
      ? "text-hivis"
      : "text-ink-300";
}

/**
 * On-demand, per-line price suggestion. The tradie taps "Suggest price" to
 * fetch a suggestion; nothing runs automatically. Every write is an explicit
 * click here — Use once (apply to this line), Save to library (persist +
 * apply), or Price manually (dismiss). The agent never sets anything itself.
 */
export function SuggestPricePanel({ line, onUseOnce, onSavedAndApply }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SuggestPriceResult | null>(null);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function fetchSuggestion() {
    setPhase("loading");
    setError("");
    try {
      const res = await fetch("/api/materials/suggest-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
        }),
        // LLM-backed — same stall guard as the core generate flow.
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        setPhase("error");
        setError("Couldn't get a suggestion. Price this line manually.");
        return;
      }
      const data = (await res.json()) as SuggestPriceResult;
      setResult(data);
      setPhase("result");
    } catch {
      setPhase("error");
      setError("Network hiccup. Price this line manually.");
    }
  }

  const rec = result?.recommendation;
  const price = rec?.suggested_unit_price ?? null;

  async function handleSave() {
    if (price == null) return;
    setSaving(true);
    const r = await saveSuggestedMaterial({
      name: line.description,
      unit: line.unit,
      price,
    });
    setSaving(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    onSavedAndApply(price);
  }

  return (
    <li
      data-testid={`suggest-price-line`}
      className="rounded-sm border border-ink-700/60 bg-ink-900/40 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-white">
          {line.description || "Untitled material"}
          <span className="ml-1.5 tabular-nums text-ink-400">
            {line.quantity} {line.unit ?? ""}
          </span>
        </span>
        {phase === "idle" && (
          <button
            type="button"
            onClick={fetchSuggestion}
            data-testid="suggest-price-button"
            className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-brand/40 bg-brand/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-brand hover:bg-brand/20"
          >
            <Sparkle size={11} weight="bold" />
            Suggest price
          </button>
        )}
        {phase === "loading" && (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400">
            thinking…
          </span>
        )}
      </div>

      {phase === "error" && (
        <p className="mt-2 text-[11px] text-red-300">{error}</p>
      )}

      {phase === "result" && rec && (
        <div className="mt-2.5 border-t border-white/5 pt-2.5">
          {price != null ? (
            <p className="text-sm text-white">
              Suggested{" "}
              <span className="font-mono tabular-nums text-brand">
                {money(price)}
              </span>{" "}
              <span className="text-ink-400">/ {line.unit ?? "each"}</span>
              {rec.suggested_price_range_low != null &&
                rec.suggested_price_range_high != null && (
                  <span className="ml-1.5 text-[11px] text-ink-400">
                    (range {money(rec.suggested_price_range_low)}–
                    {money(rec.suggested_price_range_high)})
                  </span>
                )}
              <span
                className={`ml-2 font-mono text-[9px] uppercase tracking-[0.15em] ${confTone(rec.confidence)}`}
              >
                {rec.confidence} confidence
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-sm text-hivis">
              <Warning size={13} weight="fill" className="mt-0.5 shrink-0" />
              No safe suggestion — price this one manually.
            </p>
          )}

          {result?.reasoning.summary && (
            <p className="mt-1 text-[11px] text-ink-300">
              {result.reasoning.summary}
            </p>
          )}
          {result && result.reasoning.risk_flags.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.reasoning.risk_flags.slice(0, 3).map((f, i) => (
                <li key={i} className="text-[10px] text-hivis">
                  · {f}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {price != null && (
              <>
                <button
                  type="button"
                  onClick={() => onUseOnce(price)}
                  data-testid="suggest-use-once"
                  className="inline-flex items-center gap-1 rounded-sm bg-brand px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-950 hover:bg-brand/90"
                >
                  <Check size={11} weight="bold" />
                  Use once
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  data-testid="suggest-save-library"
                  className="inline-flex items-center gap-1 rounded-sm border border-ink-600 bg-ink-800 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-100 hover:border-brand/50 disabled:opacity-50"
                >
                  {saving ? "saving…" : "Save to library"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setPhase("idle")}
              data-testid="suggest-price-manually"
              className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 hover:text-white"
            >
              Price manually
            </button>
          </div>
          {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
        </div>
      )}
    </li>
  );
}
