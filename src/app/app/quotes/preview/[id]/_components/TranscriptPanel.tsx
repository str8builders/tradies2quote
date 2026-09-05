"use client";

import { fetchWithTimeout } from "@/lib/fetchTimeout";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
  Copy,
  PencilSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  CleanedTranscript,
  TranscriptSummary,
} from "@/lib/transcriptCleanup";

/**
 * ChatGPT-style transcript panel — sits above the quote editor on the
 * private dashboard preview page. Renders 3 cards:
 *
 *   1. "You said"       — raw voice/typed transcript (read-only)
 *   2. "AI cleaned it to" — the deterministic + LLM cleaned version,
 *                          editable, with Edit / Save / Regenerate
 *   3. "AI understood"  — the structured summary with warning badges
 *
 * Privacy: this component lives only under
 * `src/app/app/quotes/preview/[id]/_components/` and is NOT imported
 * by anything under `src/app/quote/[token]/`. The transcript object
 * comes from `quote_data.transcript`, which the `get_quote_by_token`
 * RPC does not project.
 */

export type TranscriptPanelData = {
  raw: string;
  cleaned: string;
  summary: TranscriptSummary | null;
  corrections: CleanedTranscript["corrections"];
  clarification_questions: CleanedTranscript["clarificationQuestions"];
  confidence: number;
  fallback?: CleanedTranscript["fallback"];
};

type Props = {
  quoteId: string;
  transcript: TranscriptPanelData;
};

export function TranscriptPanel({ quoteId, transcript }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(transcript.cleaned);
  const [pending, setPending] = useState<"save" | "regen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"raw" | "cleaned" | null>(null);

  const onCopy = async (which: "raw" | "cleaned") => {
    const text = which === "raw" ? transcript.raw : transcript.cleaned;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Older browsers — silently fail.
    }
  };

  const onSave = async () => {
    if (!editedText.trim()) return;
    setError(null);
    setPending("save");
    try {
      const res = await fetchWithTimeout(`/api/quotes/${quoteId}/transcript`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cleanedTranscript: editedText }),
        // Plain DB save — a hung request shouldn't wedge the panel.
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Failed to save transcript");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(null);
    }
  };

  const onRegenerate = async () => {
    if (!editedText.trim()) return;
    setError(null);
    setPending("regen");
    try {
      const res = await fetchWithTimeout(
        `/api/quotes/${quoteId}/transcript/regenerate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cleanedTranscript: editedText }),
          // LLM-backed — same stall guard as the core generate flow.
          signal: AbortSignal.timeout(90_000),
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Failed to regenerate quote");
      }
      // Clearing quote_data flips the preview page back to QuoteGenerator,
      // which auto-fires /api/quotes/generate against the new voice_transcript.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      data-testid="transcript-panel"
      className="space-y-3 rounded-sm border border-ink-700 bg-ink-800/40 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="t2q-section-label-pro">{"// transcript"}</p>
        {transcript.fallback === "summary_failed" && (
          // Wave 19.5 — bumped from a muted ink-400 corner badge to a
          // hivis warning pill so silent AI failures actually announce
          // themselves. Founder-facing observability: if you ever see
          // this pill on a real quote, the Anthropic call didn't fire
          // and the quote was built by the deterministic regex pass
          // alone. Pair this with the matching `[transcript] fallback`
          // line in /api/quotes/generate/route.ts → Vercel runtime logs.
          <span
            data-testid="transcript-ai-fallback-pill"
            className="inline-flex items-center gap-1.5 rounded-sm border border-hivis/40 bg-hivis/10 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-hivis"
          >
            <WarningCircle size={12} weight="fill" />
            T2Q skipped · rules only
          </span>
        )}
      </div>

      {/* Card 1 — raw */}
      <RawCard
        text={transcript.raw}
        onCopy={() => onCopy("raw")}
        copied={copied === "raw"}
      />

      {/* Card 2 — cleaned (editable) */}
      <CleanedCard
        text={editing ? editedText : transcript.cleaned}
        editing={editing}
        pending={pending}
        correctionsCount={transcript.corrections.length}
        clarificationsCount={transcript.clarification_questions.length}
        onTextChange={setEditedText}
        onCopy={() => onCopy("cleaned")}
        copied={copied === "cleaned"}
        onEdit={() => {
          setEditedText(transcript.cleaned);
          setEditing(true);
        }}
        onCancel={() => {
          setEditedText(transcript.cleaned);
          setEditing(false);
        }}
        onSave={onSave}
        onRegenerate={onRegenerate}
      />

      {/* Card 3 — AI understood (summary) */}
      {transcript.summary && (
        <SummaryCard summary={transcript.summary} confidence={transcript.confidence} />
      )}

      {/* Inline corrections + clarifications */}
      {transcript.corrections.length > 0 && (
        <CorrectionsList corrections={transcript.corrections} />
      )}
      {transcript.clarification_questions.length > 0 && (
        <ClarificationsList items={transcript.clarification_questions} />
      )}

      {error && (
        <p className="rounded-sm border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function RawCard({
  text,
  onCopy,
  copied,
}: {
  text: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div
      data-testid="transcript-raw-card"
      className="rounded-sm border border-ink-700 bg-ink-900/60 p-3"
    >
      <div className="mb-1 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
          {"// you said"}
        </p>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy raw transcript"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 hover:text-white"
        >
          <Copy size={12} weight="bold" />
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink-200">{text}</p>
    </div>
  );
}

function CleanedCard({
  text,
  editing,
  pending,
  correctionsCount,
  clarificationsCount,
  onTextChange,
  onCopy,
  copied,
  onEdit,
  onCancel,
  onSave,
  onRegenerate,
}: {
  text: string;
  editing: boolean;
  pending: "save" | "regen" | null;
  correctionsCount: number;
  clarificationsCount: number;
  onTextChange: (t: string) => void;
  onCopy: () => void;
  copied: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div
      data-testid="transcript-cleaned-card"
      className="rounded-sm border border-brand/30 bg-brand/5 p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
          {"// t2q cleaned it to"}
        </p>
        <div className="flex items-center gap-3">
          {correctionsCount > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
              {correctionsCount} {correctionsCount === 1 ? "correction" : "corrections"}
            </span>
          )}
          {clarificationsCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
              <WarningCircle size={10} weight="bold" />
              {clarificationsCount} unclear
            </span>
          )}
          {!editing && (
            <button
              type="button"
              onClick={onCopy}
              aria-label="Copy cleaned transcript"
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 hover:text-white"
            >
              <Copy size={12} weight="bold" />
              {copied ? "copied" : "copy"}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          data-testid="transcript-cleaned-textarea"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={6}
          className="w-full rounded-sm border border-ink-700 bg-ink-900 p-2 text-sm text-white placeholder-ink-500"
          placeholder="Edit the cleaned transcript"
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-white">{text}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!editing ? (
          <button
            type="button"
            data-testid="transcript-edit"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:border-ink-500 hover:text-white"
          >
            <PencilSimple size={12} weight="bold" />
            Edit
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="transcript-save"
              onClick={onSave}
              disabled={pending !== null || text.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:border-ink-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === "save" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              data-testid="transcript-regenerate"
              onClick={onRegenerate}
              disabled={pending !== null || text.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-sm border border-brand bg-brand/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowsClockwise size={12} weight="bold" />
              {pending === "regen" ? "Regenerating…" : "Regenerate quote"}
            </button>
            <button
              type="button"
              data-testid="transcript-cancel"
              onClick={onCancel}
              disabled={pending !== null}
              className="inline-flex items-center gap-1 rounded-sm border border-ink-700 bg-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  summary,
  confidence,
}: {
  summary: TranscriptSummary;
  confidence: number;
}) {
  return (
    <div
      data-testid="transcript-summary-card"
      className="rounded-sm border border-ink-700 bg-ink-900/60 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
          {"// t2q understood"}
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
          {Math.round(confidence * 100)}% confident
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <SummaryRow label="Job type" value={summary.job_type} />
        <SummaryRow label="Site/client" value={summary.site_or_client} />
        <SummaryRow label="Dimensions" value={summary.dimensions} />
        <SummaryRow label="Surface" value={summary.surface_context} />
        <SummaryRow label="Exposure" value={summary.exposure_context} />
      </dl>

      <SummaryListSection
        label="Material assumptions"
        items={summary.material_assumptions}
        tone="neutral"
      />
      <SummaryListSection
        label="Missing information"
        items={summary.missing_information}
        tone="warning"
      />
      <SummaryListSection
        label="Compliance risks"
        items={summary.compliance_risks}
        tone="risk"
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-white">
        {value ?? <span className="italic text-ink-400">unspecified</span>}
      </dd>
    </div>
  );
}

function SummaryListSection({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "neutral" | "warning" | "risk";
}) {
  if (items.length === 0) return null;
  const toneClass: Record<typeof tone, string> = {
    neutral: "text-ink-300",
    warning: "text-hivis",
    risk: "text-red-300",
  };
  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {`// ${label.toLowerCase()}`}
      </p>
      <ul className={`mt-1 list-disc space-y-0.5 pl-5 text-xs ${toneClass[tone]}`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function CorrectionsList({
  corrections,
}: {
  corrections: CleanedTranscript["corrections"];
}) {
  return (
    <details
      data-testid="transcript-corrections"
      className="rounded-sm border border-ink-700 bg-ink-900/60 p-3"
    >
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {`// ${corrections.length} ${corrections.length === 1 ? "correction" : "corrections"}`}
      </summary>
      <ul className="mt-2 space-y-1 text-xs">
        {corrections.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-1">
            <span className="font-mono text-ink-500 line-through">{c.before}</span>
            <span className="font-mono text-ink-400">→</span>
            <span className="font-mono text-brand">{c.after}</span>
            {c.contextual && (
              <span className="ml-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
                <WarningCircle size={10} weight="bold" />
                contextual
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ClarificationsList({
  items,
}: {
  items: CleanedTranscript["clarificationQuestions"];
}) {
  return (
    <div
      data-testid="transcript-clarifications"
      className="rounded-sm border border-hivis/40 bg-hivis/5 p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <WarningCircle size={14} weight="bold" className="text-hivis" />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
          {`// ${items.length} ${items.length === 1 ? "unclear phrase" : "unclear phrases"}`}
        </p>
      </div>
      <ul className="space-y-2 text-xs text-ink-200">
        {items.map((c) => (
          <li key={c.id}>
            <p className="font-semibold text-white">{c.question}</p>
            <p className="text-ink-300">{c.why}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
