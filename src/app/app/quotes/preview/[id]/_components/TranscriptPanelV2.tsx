"use client";

import type { ComponentProps, ReactNode } from "react";
import { ArrowsClockwise, CaretDown, Copy, PencilSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { StatusPill } from "@/components/ui/status-pill";
import type { CleanedTranscript, TranscriptSummary } from "@/lib/transcriptCleanup";
import type { CleanedCard as ClassicCleanedCard } from "./TranscriptPanel";

// "What you said" in the new look. The same cards, props, words, test ids and
// roles as TranscriptPanel's classic cards; only the drawing differs: kit
// parts and ui- tokens, so every card reads right in dark and outdoor mode.
// TranscriptPanel picks this set when it is given look="new" (the job page's
// More tools, whose section already titles it, so there's no label on top).

/** The panel around the cards: the rules-only warning, the cards, and a problem. */
export function TranscriptFrame({
  fallback,
  error,
  children,
}: {
  /** The AI summary didn't run: the quote was built by the rules alone. */
  fallback: boolean;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <section data-testid="transcript-panel" className="space-y-3">
      {fallback ? (
        <p data-testid="transcript-ai-fallback-pill">
          <StatusPill tone="warn" icon={<WarningCircle weight="fill" />}>
            T2Q skipped · rules only
          </StatusPill>
        </p>
      ) : null}
      {children}
      {error ? (
        <div role="alert">
          <Callout tone="bad" title={error} />
        </div>
      ) : null}
    </section>
  );
}

/** Copy, with a 48 px tap area; says so on the button once copied. */
function CopyAction({ label, copied, onCopy }: { label: string; copied: boolean; onCopy: () => void }) {
  return (
    <Button variant="ghost" size="sm" icon={<Copy weight="bold" />} aria-label={label} onClick={onCopy}>
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function RawCard({ text, onCopy, copied }: { text: string; onCopy: () => void; copied: boolean }) {
  return (
    <div data-testid="transcript-raw-card" className="rounded-ui-md border border-ui-line bg-ui-surface-2 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-ui-sm font-semibold text-ui-muted">You said</p>
        <CopyAction label="Copy raw transcript" copied={copied} onCopy={onCopy} />
      </div>
      <p className="break-words whitespace-pre-wrap text-ui-text">{text}</p>
    </div>
  );
}

/** The classic card's props; the panel always passes the warning it shows. */
type CleanedCardProps = ComponentProps<typeof ClassicCleanedCard> & { regenWarning: string };

export function CleanedCard({
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
  readOnly = false,
  canRegenerate = true,
  confirmingRegen = false,
  onAskRegenerate,
  onCancelRegenerate,
  regenWarning,
}: CleanedCardProps) {
  const empty = text.trim().length === 0;
  return (
    <div data-testid="transcript-cleaned-card" className="rounded-ui-md border border-ui-line bg-ui-brand-soft p-3">
      <div className="mb-2 flex min-h-10 items-center justify-between gap-2">
        <p className="text-ui-sm font-semibold text-ui-brand-text">T2Q cleaned it to</p>
        {!editing && <CopyAction label="Copy cleaned transcript" copied={copied} onCopy={onCopy} />}
      </div>
      {correctionsCount > 0 || clarificationsCount > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {correctionsCount > 0 && (
            <StatusPill>{`${correctionsCount} ${correctionsCount === 1 ? "correction" : "corrections"}`}</StatusPill>
          )}
          {clarificationsCount > 0 && (
            <StatusPill tone="warn" icon={<WarningCircle weight="bold" />}>
              {`${clarificationsCount} unclear`}
            </StatusPill>
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="ui-focus-within-ring rounded-ui-md border-2 border-ui-line-strong bg-ui-surface px-3 py-2 text-ui-lg text-ui-text">
          <textarea
            data-testid="transcript-cleaned-textarea"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={6}
            aria-label="Cleaned transcript"
            className="ui-input-reset block w-full resize-y"
            placeholder="Edit the cleaned transcript"
          />
        </div>
      ) : (
        <p className="break-words whitespace-pre-wrap text-ui-text">{text}</p>
      )}

      {confirmingRegen && editing && canRegenerate && (
        <div role="alertdialog" aria-label="Replace the quote lines?" data-testid="transcript-regenerate-confirm" className="mt-3">
          <Callout
            tone="warn"
            title="Replace the quote lines?"
            action={
              <div className="grid gap-2">
                <Button
                  variant="danger"
                  fullWidth
                  icon={<ArrowsClockwise weight="bold" />}
                  data-testid="transcript-regenerate-confirm-yes"
                  onClick={onRegenerate}
                  disabled={pending !== null}
                >
                  Replace the lines
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  data-testid="transcript-regenerate-confirm-no"
                  onClick={onCancelRegenerate}
                  disabled={pending !== null}
                >
                  Keep current quote
                </Button>
              </div>
            }
          >
            {regenWarning}
          </Callout>
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {readOnly ? (
          <p data-testid="transcript-read-only" className="text-ui-sm text-ui-muted">
            Quote accepted — the transcript is read-only.
          </p>
        ) : !editing ? (
          <Button variant="secondary" fullWidth icon={<PencilSimple weight="bold" />} data-testid="transcript-edit" onClick={onEdit}>
            Edit
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              fullWidth
              data-testid="transcript-save"
              onClick={onSave}
              disabled={pending !== null || empty}
              loading={pending === "save"}
              loadingLabel="Saving…"
            >
              Save
            </Button>
            {canRegenerate ? (
              <Button
                variant="secondary"
                fullWidth
                icon={<ArrowsClockwise weight="bold" />}
                data-testid="transcript-regenerate"
                onClick={onAskRegenerate ?? onRegenerate}
                disabled={pending !== null || confirmingRegen || empty}
                loading={pending === "regen"}
                loadingLabel="Regenerating…"
              >
                Regenerate quote
              </Button>
            ) : (
              <span data-testid="transcript-regenerate-unavailable" className="text-ui-sm text-ui-muted">
                Regenerate is for drafts only
              </span>
            )}
            <Button variant="ghost" fullWidth data-testid="transcript-cancel" onClick={onCancel} disabled={pending !== null}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function SummaryCard({ summary, confidence }: { summary: TranscriptSummary; confidence: number }) {
  return (
    <div data-testid="transcript-summary-card" className="rounded-ui-md border border-ui-line bg-ui-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-ui-sm font-semibold text-ui-muted">T2Q understood</p>
        <span className="text-ui-sm text-ui-muted tabular-nums">{`${Math.round(confidence * 100)}% confident`}</span>
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SummaryRow label="Job type" value={summary.job_type} />
        <SummaryRow label="Site/client" value={summary.site_or_client} />
        <SummaryRow label="Dimensions" value={summary.dimensions} />
        <SummaryRow label="Surface" value={summary.surface_context} />
        <SummaryRow label="Exposure" value={summary.exposure_context} />
      </dl>
      <SummaryList label="Material assumptions" items={summary.material_assumptions} tone="neutral" />
      <SummaryList label="Missing information" items={summary.missing_information} tone="warning" />
      <SummaryList label="Compliance risks" items={summary.compliance_risks} tone="risk" />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-ui-sm text-ui-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-ui-text">{value ?? <span className="text-ui-muted italic">unspecified</span>}</dd>
    </div>
  );
}

const LIST_TONE = { neutral: "text-ui-muted", warning: "text-ui-warn", risk: "text-ui-bad" } as const;

function SummaryList({ label, items, tone }: { label: string; items: string[]; tone: keyof typeof LIST_TONE }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-ui-sm font-semibold text-ui-muted">{label}</p>
      <ul className={cx("mt-1 list-disc space-y-0.5 pl-5 text-ui-sm", LIST_TONE[tone])}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function CorrectionsList({ corrections }: { corrections: CleanedTranscript["corrections"] }) {
  return (
    <details data-testid="transcript-corrections" className="group/fixes rounded-ui-md border border-ui-line bg-ui-surface-2">
      <summary className="ui-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-ui-md px-3 text-ui-sm font-semibold text-ui-text [&::-webkit-details-marker]:hidden">
        {`${corrections.length} ${corrections.length === 1 ? "correction" : "corrections"}`}
        <CaretDown
          aria-hidden="true"
          weight="bold"
          className="shrink-0 text-[1.125rem] text-ui-faint transition-transform duration-ui-fast ease-ui-out group-open/fixes:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ul className="space-y-1 px-3 pb-3 text-ui-sm">
        {corrections.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-1">
            <span className="text-ui-muted line-through">{c.before}</span>
            <span className="text-ui-muted">→</span>
            <span className="font-semibold text-ui-brand-text">{c.after}</span>
            {c.contextual && (
              <span className="ml-2 inline-flex items-center gap-1 text-ui-warn">
                <WarningCircle aria-hidden="true" weight="bold" />
                Contextual
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ClarificationsList({ items }: { items: CleanedTranscript["clarificationQuestions"] }) {
  return (
    <div data-testid="transcript-clarifications" className="rounded-ui-md border-2 border-ui-warn bg-ui-warn-soft p-3">
      <div className="mb-2 flex items-center gap-2">
        <WarningCircle aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-warn" />
        <p className="font-semibold text-ui-text">
          {`${items.length} ${items.length === 1 ? "unclear phrase" : "unclear phrases"}`}
        </p>
      </div>
      <ul className="space-y-2 text-ui-sm">
        {items.map((c) => (
          <li key={c.id}>
            <p className="font-semibold text-ui-text">{c.question}</p>
            <p className="text-ui-muted">{c.why}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
