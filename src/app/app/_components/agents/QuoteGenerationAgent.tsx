"use client";

import { useState } from "react";
import {
  CheckCircle,
  Microphone,
  Receipt,
  Spinner,
  Sparkle,
  Warning,
} from "@phosphor-icons/react";
import { CopyButton } from "./CopyButton";
import { VerificationPanel } from "./VerificationPanel";
import type {
  GeneratedQuote,
  GeneratedQuoteLineItem,
  LineItemCategory,
} from "@/lib/agents/quote-generation";

/**
 * Quote Generation Agent — paste a voice transcript, get a structured
 * NZ-builder quote back.
 *
 * Real backend: POSTs to `/api/agents/quote-generation` which calls
 * Anthropic Claude (`claude-sonnet-5`). Returns line items with
 * NZ trade vocab, 15% GST, and standard payment terms. NEVER writes
 * to the database — the tradie reviews + pastes the result into a
 * draft quote on `/app/quotes/new`.
 *
 * States: empty → submitting → result | error.
 */
const CATEGORY_LABELS: Record<LineItemCategory, string> = {
  materials: "Materials",
  labour: "Labour",
  subcontractor: "Subby",
  sundries: "Sundries",
};

function formatNZD(n: number): string {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
      currencyDisplay: "symbol",
    }).format(n);
  } catch {
    return `NZD ${n.toFixed(2)}`;
  }
}

function quoteToText(q: GeneratedQuote): string {
  const lines: string[] = [];
  lines.push(`Job: ${q.jobName || "—"}`);
  lines.push(`Client: ${q.clientName || "TBC"}`);
  lines.push("");
  for (const l of q.lineItems) {
    const qty = `${l.quantity} ${l.unit}`;
    lines.push(
      `[${CATEGORY_LABELS[l.category]}] ${l.description} · ${qty} × ${formatNZD(l.unitPrice)} = ${formatNZD(l.lineTotal)}`,
    );
  }
  lines.push("");
  lines.push(`Subtotal (ex GST): ${formatNZD(q.subtotal)}`);
  lines.push(`GST (${(q.gstRate * 100).toFixed(0)}%): ${formatNZD(q.gstAmount)}`);
  lines.push(`Total (incl GST): ${formatNZD(q.total)}`);
  if (q.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const n of q.notes) lines.push(`• ${n}`);
  }
  if (q.terms.trim().length > 0) {
    lines.push("");
    lines.push("Payment terms:");
    lines.push(q.terms);
  }
  return lines.join("\n");
}

export function QuoteGenerationAgent() {
  const [transcript, setTranscript] = useState("");
  const [labourRate, setLabourRate] = useState("85");
  const [markupPct, setMarkupPct] = useState("15");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GeneratedQuote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = transcript.trim().length > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agents/quote-generation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript,
          labourRate: Number(labourRate) || undefined,
          markupPct: Number(markupPct) || undefined,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; result: GeneratedQuote }
        | { error: string };
      if (!res.ok || !("ok" in json)) {
        setError(("error" in json && json.error) || `Request failed (${res.status})`);
      } else {
        setResult(json.result);
      }
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      data-testid="quote-generation-agent"
      className="t2q-card-pro p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand">
          <Microphone size={20} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
            Quote Generation Agent
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            Paste a transcript (voice memo or typed). We&apos;ll turn it into a
            structured quote with NZ trade pricing, 15% GST, and standard
            payment terms. Stand-alone — does not write to the database.
            Paste the result into a draft quote on{" "}
            <span className="font-mono text-[11px] text-ink-200">
              /app/quotes/new
            </span>{" "}
            when you&apos;re happy.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
            Transcript
          </span>
          <textarea
            data-testid="quote-generation-input"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="e.g. Sarah at 42 Te Aroha St wants the master bedroom re-lined. Three walls, strip old GIB, 10mm new GIB, Pink Batts R3.2 in the cavity. Tip run included. Should be a 2-day job for one chippie."
            rows={8}
            maxLength={12000}
            className="mt-2 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:border-brand focus:outline-none"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
              Labour rate ($/hr)
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={labourRate}
              onChange={(e) => setLabourRate(e.target.value)}
              data-testid="quote-generation-labour-rate"
              className="mt-1 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
              Markup on materials (%)
            </span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="200"
              value={markupPct}
              onChange={(e) => setMarkupPct(e.target.value)}
              data-testid="quote-generation-markup"
              className="mt-1 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!canSubmit}
              data-testid="quote-generation-submit"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-brand px-4 font-display text-sm uppercase tracking-tight text-ink-900 transition-colors hover:bg-hivis disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
            >
              {submitting ? (
                <>
                  <Spinner size={14} weight="bold" className="animate-spin" />
                  Drafting…
                </>
              ) : (
                <>
                  <Receipt size={14} weight="bold" />
                  Draft quote
                </>
              )}
            </button>
          </div>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
          {transcript.trim().length} / 12000
        </p>
      </form>

      {error && (
        <div
          role="alert"
          data-testid="quote-generation-error"
          className="mt-5 rounded-sm border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200"
        >
          <Warning size={14} weight="bold" className="mr-1 inline-block" />
          {error}
        </div>
      )}

      {result && (
        <div data-testid="quote-generation-result" className="mt-5 space-y-4">
          <div className="rounded-sm border border-ink-600 bg-ink-900/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                  Job
                </p>
                <p className="font-display text-base uppercase tracking-tight text-white">
                  {result.jobName || "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                  Client
                </p>
                <p className="font-display text-base uppercase tracking-tight text-white">
                  {result.clientName || "TBC"}
                </p>
              </div>
            </div>
          </div>

          {/* Verification pass — deterministic checks always run; the LLM critic
              runs when QUOTE_VERIFY_ENABLED. Surfaced so issues aren't invisible. */}
          {result.verification && (
            <VerificationPanel report={result.verification} />
          )}

          <div className="rounded-sm border border-ink-600 bg-ink-900/60">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-ink-400">
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                    Line
                  </th>
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                    Qty
                  </th>
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                    Unit price
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-[0.2em]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.lineItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-ink-400"
                    >
                      No line items extracted.
                    </td>
                  </tr>
                ) : (
                  result.lineItems.map((l: GeneratedQuoteLineItem, i) => (
                    <tr
                      key={i}
                      className="border-b border-ink-800 last:border-0"
                    >
                      <td className="px-3 py-2 text-ink-100">
                        {l.description}
                        <span className="ml-2 inline-flex items-center gap-1 rounded-sm border border-ink-700 bg-ink-800/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-300">
                          <Sparkle size={9} weight="fill" />
                          {CATEGORY_LABELS[l.category]}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-200">
                        {l.quantity}{" "}
                        <span className="text-ink-500">{l.unit}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-200">
                        {formatNZD(l.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white">
                        {formatNZD(l.lineTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Subtotal (ex GST)" value={formatNZD(result.subtotal)} />
            <Stat
              label={`GST (${(result.gstRate * 100).toFixed(0)}%)`}
              value={formatNZD(result.gstAmount)}
            />
            <Stat
              label="Total (incl GST)"
              value={formatNZD(result.total)}
              tone="brand"
            />
          </div>

          {result.notes.length > 0 && (
            <div className="rounded-sm border border-ink-600 bg-ink-900/60 p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                <CheckCircle size={12} weight="bold" className="text-brand" />
                Assumptions
              </div>
              <ul className="space-y-1 text-sm text-ink-200">
                {result.notes.map((n, i) => (
                  <li key={i} className="list-inside list-disc">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.terms.trim().length > 0 && (
            <div className="rounded-sm border border-ink-600 bg-ink-900/60 p-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                Payment terms
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-100">
                {result.terms}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <CopyButton
              text={quoteToText(result)}
              testId="quote-generation-copy"
              label="Copy quote as text"
            />
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-500">
            {"// stand-alone tool · no DB write · review before sending"}
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <div className="rounded-sm border border-ink-700 bg-ink-900/40 px-3 py-3">
      <p
        className={`font-display tabular-nums leading-none ${tone === "brand" ? "text-brand" : "text-white"} text-base sm:text-lg`}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
        {label}
      </p>
    </div>
  );
}
