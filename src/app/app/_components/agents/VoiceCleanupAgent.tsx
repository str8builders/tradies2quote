"use client";

import { useEffect, useMemo, useRef } from "react";
import { Microphone, MagicWand } from "@phosphor-icons/react";
import { runVoiceCleanup } from "@/lib/agents/voice-cleanup";
import { logClientAgentRun } from "./_log-run";
import { CopyButton } from "./CopyButton";
import { VoiceCleanupAgentV2 } from "./VoiceCleanupAgentV2";

/**
 * Voice Cleanup Agent — pure presentational client component.
 *
 * Renders the original voice transcript on the left, the cleaned
 * version on the right (or stacked on mobile). Cleanup is a synchronous
 * pure function so the result is computed at render-time — no API
 * call, no Anthropic, no DB write. The "Copy cleaned text" button just
 * puts the cleaned string on the clipboard.
 *
 * The original transcript is NEVER modified by this component.
 *
 * `look="new"` draws the same result with the kit (VoiceCleanupAgentV2) for
 * the new-look job page.
 */
interface Props {
  transcript: string | null;
  look?: "classic" | "new";
}

export function VoiceCleanupAgent({ transcript, look = "classic" }: Props) {
  const original = (transcript ?? "").trim();
  const result = useMemo(() => runVoiceCleanup(original), [original]);

  // Telemetry — log one run to the monitoring dashboard the first time
  // this component cleans a non-empty transcript. Guarded by a ref so a
  // changing transcript prop doesn't spam the dashboard.
  const loggedRef = useRef(false);
  useEffect(() => {
    if (loggedRef.current || !original) return;
    loggedRef.current = true;
    const n = result.corrections.length;
    void logClientAgentRun({
      agentName: "Voice Cleanup Agent",
      message: result.changed
        ? n > 0
          ? `Transcript cleaned — ${n} NZ-trade correction${n === 1 ? "" : "s"} applied, formatting tidied`
          : "Transcript cleaned — fillers trimmed, formatting tidied"
        : "Transcript checked — already clean",
      ok: true,
    });
  }, [original, result]);

  if (!original) {
    return null;
  }

  if (look === "new") return <VoiceCleanupAgentV2 original={original} result={result} />;

  return (
    <section
      data-testid="agent-voice-cleanup"
      className="t2q-card-pro mb-6 p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
        >
          <Microphone size={20} weight="bold" />
        </span>
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
            Voice Cleanup Agent.
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300">
            {"// trade-aware cleanup · read-only · apply to copy"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300">
              {"// original"}
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              {result.originalLength} chars
            </span>
          </div>
          <pre
            data-testid="agent-voice-cleanup-original"
            className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-ink-700 bg-ink-900/40 p-3 text-sm leading-relaxed text-ink-200 font-sans"
          >
            {original}
          </pre>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
              {"// cleaned"}
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              {result.cleanedLength} chars
            </span>
          </div>
          <pre
            data-testid="agent-voice-cleanup-result"
            className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-brand/40 bg-brand/5 p-3 text-sm leading-relaxed text-white font-sans"
          >
            {result.cleaned}
          </pre>
        </div>
      </div>

      {result.corrections.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
            {"// trade corrections"}
          </p>
          <ul
            data-testid="agent-voice-cleanup-corrections"
            className="mt-2 flex flex-wrap gap-2"
          >
            {result.corrections.map((c, i) => (
              <li
                key={`${c.index}-${c.before}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-ink-700 bg-ink-900/40 px-2.5 py-1 text-xs"
              >
                <span className="text-ink-500 line-through">{c.before}</span>
                <span className="text-ink-500" aria-hidden="true">
                  &rarr;
                </span>
                <span className="font-medium text-white">{c.after}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.clarifications.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-hivis">
            {"// double-check"}
          </p>
          <ul
            data-testid="agent-voice-cleanup-clarifications"
            className="mt-2 space-y-1.5"
          >
            {result.clarifications.map((q) => (
              <li key={q.id} className="text-xs leading-relaxed text-ink-200">
                <span className="text-white">{q.question}</span>{" "}
                <span className="text-ink-400">{q.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p
          data-testid="agent-voice-cleanup-status"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400"
        >
          {result.changed
            ? result.corrections.length > 0
              ? `// ${result.corrections.length} trade ${result.corrections.length === 1 ? "fix" : "fixes"} + formatting tidied`
              : "// fillers trimmed + formatting tidied"
            : "// transcript already clean — no changes needed"}
        </p>
        <div className="flex items-center gap-2 sm:justify-end">
          <CopyButton
            text={result.cleaned}
            label={
              <span className="inline-flex items-center gap-1.5">
                <MagicWand size={14} weight="bold" />
                Apply (copy)
              </span>
            }
            testId="agent-voice-cleanup-apply"
            disabled={!result.changed}
          />
        </div>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {"// original transcript is never overwritten by this agent"}
      </p>
    </section>
  );
}
