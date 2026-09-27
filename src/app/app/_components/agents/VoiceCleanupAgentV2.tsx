"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import type { VoiceCleanupResult } from "@/lib/agents/voice-cleanup";
import { CopyButton } from "./CopyButton";

function TranscriptBox({
  title,
  length,
  text,
  testId,
  tidied = false,
}: {
  title: string;
  length: number;
  text: string;
  testId: string;
  tidied?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="ui-title text-ui-base text-ui-text">{title}</h3>
        <span className="text-ui-sm text-ui-muted">{length} characters</span>
      </div>
      <p
        data-testid={testId}
        className={cx(
          "mt-2 whitespace-pre-wrap break-words rounded-ui-md border p-3 text-ui-sm",
          tidied ? "border-ui-brand bg-ui-brand-soft" : "border-ui-line bg-ui-surface-2",
        )}
      >
        {text}
      </p>
    </div>
  );
}

/**
 * The recording tidy-up in the new look (VoiceCleanupAgent look="new"): what
 * was said beside the tidied version, the trade fixes, what to double-check
 * and a copy button. Same result and test ids as the classic panel; the
 * recording itself is never changed.
 */
export function VoiceCleanupAgentV2({ original, result }: { original: string; result: VoiceCleanupResult }) {
  const fixes = result.corrections.length;
  return (
    <section data-testid="agent-voice-cleanup" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TranscriptBox
          title="What you said"
          length={result.originalLength}
          text={original}
          testId="agent-voice-cleanup-original"
        />
        <TranscriptBox
          title="Tidied up"
          length={result.cleanedLength}
          text={result.cleaned}
          testId="agent-voice-cleanup-result"
          tidied
        />
      </div>

      {fixes > 0 ? (
        <div>
          <h3 className="ui-title text-ui-base text-ui-text">Trade fixes</h3>
          <ul data-testid="agent-voice-cleanup-corrections" className="mt-2 flex flex-wrap gap-2">
            {result.corrections.map((c, i) => (
              <li
                key={`${c.index}-${c.before}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-ui-surface-2 px-3 py-1 text-ui-sm"
              >
                <span className="text-ui-muted line-through">{c.before}</span>
                <ArrowRight aria-hidden="true" weight="bold" className="shrink-0 text-ui-faint" />
                <span className="sr-only"> became </span>
                <span className="font-semibold">{c.after}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.clarifications.length > 0 ? (
        <div>
          <h3 className="ui-title text-ui-base text-ui-text">Worth double-checking</h3>
          <ul data-testid="agent-voice-cleanup-clarifications" className="mt-2 space-y-2">
            {result.clarifications.map((q) => (
              <li key={q.id} className="text-ui-sm">
                <span className="font-semibold">{q.question}</span> <span className="text-ui-muted">{q.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <p data-testid="agent-voice-cleanup-status" className="text-ui-sm text-ui-muted">
          {result.changed
            ? fixes > 0
              ? `${fixes} trade ${fixes === 1 ? "fix" : "fixes"}, and the formatting tidied.`
              : "Filler words taken out and the formatting tidied."
            : "Already clean. Nothing to change."}
        </p>
        <CopyButton
          look="new"
          text={result.cleaned}
          label="Copy the tidied version"
          testId="agent-voice-cleanup-apply"
          disabled={!result.changed}
        />
      </div>

      <p className="text-ui-sm text-ui-muted">
        Your recording is never changed. Paste the tidied version wherever you need it.
      </p>
    </section>
  );
}
