"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react/dist/ssr";
import type { Clarification } from "@/lib/clarifications";

/**
 * ClarificationModal — Wave 36 — Claude-Code-style question popup.
 *
 * The new-quote flow opens this modal AFTER the user reviews the
 * transcribed text and BEFORE the quote is generated. Each question
 * in the list is shown one at a time with progress dots; the user
 * picks an option (radio) or types a free-text answer, hits Continue,
 * and we advance to the next. On the last question, "Continue" turns
 * into "Generate quote" — the parent's `onComplete` handler then
 * appends the answers to the transcript and submits the form that
 * was paused behind this modal.
 *
 * Design rules:
 *   - Skipping a question is allowed; the answer comes back as null.
 *   - "Other" is auto-appended to every radio set so the tradie has
 *     an escape hatch into free-text input.
 *   - Closing the modal (X / Escape / backdrop tap) cancels — the
 *     parent decides whether that means "generate anyway" or "abort";
 *     this component just calls `onCancel`.
 *   - Full-screen sheet on mobile (slides up), centered dialog on
 *     ≥sm. Matches the AccountHub sheet's vibe.
 *   - Never blocks the back navigation: the parent owns the trigger
 *     and can re-open if needed.
 */

export type ClarificationAnswer = {
  questionId: string;
  /**
   * The selected radio option label, OR the free-text content when the
   * question had no radio options (open-ended). When the user picked
   * "Other" + typed something, this holds that typed string.
   * `null` means the user skipped the question.
   */
  answer: string | null;
};

type Props = {
  /** Whether to render the modal at all. */
  open: boolean;
  /** Ordered list of questions to walk through. */
  questions: Clarification[];
  /** Called with the full answers list when the user finishes. */
  onComplete: (answers: ClarificationAnswer[]) => void;
  /** Called when the user dismisses without completing. */
  onCancel: () => void;
};

const OTHER_OPTION = "Other (type below)";

export function ClarificationModal({
  open,
  questions,
  onComplete,
  onCancel,
}: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<string, { picked: string | null; text: string }>
  >({});

  // Reset internal state every time the modal re-opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate state reset on prop change
      setIndex(0);
      setAnswers({});
    }
  }, [open]);

  // Escape closes the modal — same behaviour as tapping the backdrop.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const current = questions[index] ?? null;
  const total = questions.length;
  const isLast = index === total - 1;
  const isFirst = index === 0;

  const currentAnswer = useMemo(
    () =>
      current
        ? answers[current.id] ?? { picked: null, text: "" }
        : { picked: null, text: "" },
    [current, answers],
  );

  const hasOptions = (current?.options.length ?? 0) > 0;
  const showFreeText = hasOptions
    ? currentAnswer.picked === OTHER_OPTION
    : true;

  // "Continue" is enabled when the user has either picked a non-"Other"
  // radio option OR typed at least one character of free text. The
  // dedicated "Skip" button covers the empty-answer path.
  const canAdvance = useMemo(() => {
    if (!current) return false;
    if (hasOptions && currentAnswer.picked && currentAnswer.picked !== OTHER_OPTION) {
      return true;
    }
    if (showFreeText && currentAnswer.text.trim().length > 0) {
      return true;
    }
    return false;
  }, [current, hasOptions, currentAnswer, showFreeText]);

  if (!open) return null;
  if (total === 0) {
    // Defensive — the caller shouldn't open the modal with no
    // questions, but if it does, immediately treat it as complete.
    onComplete([]);
    return null;
  }
  if (!current) return null;

  function recordAndAdvance(answer: string | null) {
    const built: ClarificationAnswer[] = questions.map((q, i) => {
      if (i < index) {
        const prior = answers[q.id] ?? { picked: null, text: "" };
        return {
          questionId: q.id,
          answer: resolveAnswer(prior),
        };
      }
      if (i === index) {
        return { questionId: q.id, answer };
      }
      return { questionId: q.id, answer: null };
    });
    if (isLast) {
      onComplete(built);
      return;
    }
    // Persist this question's answer into our state then advance.
    setAnswers((prev) => ({
      ...prev,
      [current!.id]: {
        picked: answer,
        text: answer && !current!.options.includes(answer) ? answer : "",
      },
    }));
    setIndex((i) => i + 1);
  }

  function handleSkip() {
    recordAndAdvance(null);
  }

  function handleContinue() {
    const resolved = resolveAnswer(currentAnswer);
    recordAndAdvance(resolved);
  }

  function handleBack() {
    if (isFirst) return;
    setIndex((i) => i - 1);
  }

  /**
   * "Skip the rest" — keep every answer collected so far (including
   * the one currently in-flight on the visible question, if any),
   * fill the remaining questions with null answers, and complete the
   * flow immediately. Used when the tradie has answered the
   * material/labour-critical questions early and the rest feel like
   * noise.
   */
  function handleSkipRest() {
    const resolvedCurrent = resolveAnswer(currentAnswer);
    const built: ClarificationAnswer[] = questions.map((q, i) => {
      if (i < index) {
        const prior = answers[q.id] ?? { picked: null, text: "" };
        return { questionId: q.id, answer: resolveAnswer(prior) };
      }
      if (i === index) {
        return { questionId: q.id, answer: resolvedCurrent };
      }
      return { questionId: q.id, answer: null };
    });
    onComplete(built);
  }

  function handlePick(option: string) {
    setAnswers((prev) => ({
      ...prev,
      [current!.id]: {
        picked: option,
        text: prev[current!.id]?.text ?? "",
      },
    }));
  }

  function handleText(value: string) {
    setAnswers((prev) => ({
      ...prev,
      [current!.id]: {
        picked: hasOptions ? OTHER_OPTION : null,
        text: value,
      },
    }));
  }

  // Portal to <body> so the modal escapes the /app scroll container's
  // stacking context. Inside `.t2q-app-scroll` its z-index is trapped below
  // fixed mobile controls, which can cover the footer (Back / Skip /
  // Continue). At the body level they can no longer overlap it.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="clarification-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clarification-modal-title"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-ink-700 bg-ink-950 text-white shadow-2xl sm:rounded-2xl sm:max-h-[85vh]"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-ink-700 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p
              data-testid="clarification-progress"
              className="font-mono text-[10px] uppercase tracking-[0.25em] text-hivis"
            >
              {`// t2q has ${total} ${total === 1 ? "question" : "questions"} · ${index + 1} of ${total}`}
            </p>
            <h2
              id="clarification-modal-title"
              data-testid="clarification-question"
              className="mt-2 font-display text-xl uppercase tracking-tight sm:text-2xl"
            >
              {current.question}
            </h2>
            <p className="mt-1.5 text-xs text-ink-300 sm:text-sm">
              {current.why}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-testid="clarification-close"
            aria-label="Cancel and generate without answers"
            className="-mr-3 -mt-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-400 hover:text-white"
          >
            <X size={16} weight="bold" />
          </button>
        </header>

        {/* Options / free text */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {hasOptions && (
            <ul
              data-testid="clarification-options"
              className="space-y-2"
              role="radiogroup"
            >
              {[...current.options, OTHER_OPTION].map((opt) => {
                const selected = currentAnswer.picked === opt;
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-testid={`clarification-option-${opt}`}
                      onClick={() => handlePick(opt)}
                      className={[
                        "flex w-full min-h-[48px] items-center gap-3 rounded-sm border px-4 py-3 text-left transition-colors",
                        selected
                          ? "border-brand bg-brand/10 text-white"
                          : "border-ink-700 bg-ink-900 text-ink-100 hover:border-brand/60",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-brand"
                            : "border-ink-500",
                        ].join(" ")}
                      >
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-brand" />
                        )}
                      </span>
                      <span className="flex-1 text-sm sm:text-base">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {showFreeText && (
            <div className={hasOptions ? "mt-3" : ""}>
              <label
                htmlFor="clarification-free-text"
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300"
              >
                {hasOptions ? "// other — type your answer" : "// type your answer"}
              </label>
              <textarea
                id="clarification-free-text"
                data-testid="clarification-free-text"
                value={currentAnswer.text}
                onChange={(e) => handleText(e.target.value)}
                placeholder="Add detail here…"
                rows={3}
                className="mt-1.5 block w-full resize-none rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
              />
            </div>
          )}
        </div>

        {/* "Skip the rest" — only meaningful when there are remaining
            questions after the current one. Sits ABOVE the primary
            footer row so it's a clear "I'm done, build the quote"
            escape hatch without crowding the Back / Skip / Continue
            buttons. Treated as: keep every answer so far (including
            anything selected on the visible question), null the rest,
            complete immediately. */}
        {!isLast && (
          <div className="border-t border-ink-800 bg-ink-950 px-4 py-2 sm:px-6">
            <button
              type="button"
              onClick={handleSkipRest}
              data-testid="clarification-skip-rest"
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-brand"
            >
              {`Skip the rest · build with what I've answered (${total - index - 1} left)`}
              <CaretRight size={10} weight="bold" />
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className="flex flex-wrap items-center gap-2 gap-y-2 border-t border-ink-700 bg-ink-950 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={isFirst}
            data-testid="clarification-back"
            className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-ink-700 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-200 hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CaretLeft size={12} weight="bold" />
            Back
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkip}
              data-testid="clarification-skip"
              className="inline-flex h-11 items-center px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-brand"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canAdvance}
              data-testid="clarification-continue"
              className="t2q-btn-primary-pro !h-11 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLast ? "Generate quote" : "Continue"}
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
        </footer>

        {/* Progress dots */}
        <div className="border-t border-ink-800 bg-ink-950 px-4 pb-3 pt-2 sm:px-6">
          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {questions.map((_, i) => (
              <span
                key={i}
                className={[
                  "h-1 w-6 rounded-full",
                  i === index
                    ? "bg-brand"
                    : i < index
                      ? "bg-ink-500"
                      : "bg-ink-800",
                ].join(" ")}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Resolve the stored {picked, text} pair into the canonical answer
 * string for the parent. Free-text wins when the user picked "Other";
 * otherwise the radio pick wins; otherwise null.
 */
function resolveAnswer(state: { picked: string | null; text: string }): string | null {
  if (state.picked && state.picked !== OTHER_OPTION) return state.picked;
  const t = state.text.trim();
  if (t.length > 0) return t;
  return null;
}
