"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { TAP } from "@/components/ui/styles";
import { TextField } from "@/components/ui/text-field";
import type { ClarificationQuestion } from "@/lib/compliance";
import { answersAreComplete, type ClarificationAnswers } from "@/lib/compliance/panel-helpers";

export interface ClarificationFormV2Props {
  questions: ClarificationQuestion[];
  answers: ClarificationAnswers;
  onChange: (a: ClarificationAnswers) => void;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

/**
 * The clarification form in the new look, for CompliancePanel look="new".
 * Same props, test ids and rules as ClarificationForm: owns no state, a set
 * answer is a tap on one of its options (pressed shows the pick), anything
 * else is typed, and Save waits until every question has an answer.
 */
export function ClarificationFormV2({
  questions,
  answers,
  onChange,
  onSubmit,
  submitting,
  submitError,
}: ClarificationFormV2Props) {
  const allAnswered = answersAreComplete(questions, answers);
  const unanswered = questions.filter((q) => !answers[q.id]).length;

  return (
    <form
      data-testid="clarification-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitting) void onSubmit();
      }}
      className="space-y-4 rounded-ui-md bg-ui-surface-2 p-3"
    >
      <h3 className="ui-title text-ui-base text-ui-text">Answer these to finish the materials</h3>
      <ol className="space-y-5">
        {questions.map((q, idx) => {
          const value = answers[q.id] ?? "";
          return (
            <li key={q.id} data-testid={`clarification-q-${q.id}`}>
              {q.options ? (
                <fieldset>
                  <legend className="font-semibold">
                    {idx + 1}. {q.question}
                  </legend>
                  <p className="mt-0.5 text-ui-sm text-ui-muted">{q.why}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((opt) => {
                      const picked = value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          data-testid={`clarification-opt-${q.id}-${opt.value}`}
                          aria-pressed={picked}
                          onClick={() => onChange({ ...answers, [q.id]: opt.value })}
                          className={cx(
                            "ui-focus-ring inline-flex min-h-12 items-center gap-2 rounded-ui-md border-2 px-4 font-semibold text-ui-text",
                            TAP,
                            picked ? "border-ui-brand bg-ui-brand-soft" : "border-ui-line bg-ui-surface hover:border-ui-line-strong",
                          )}
                        >
                          {picked ? <Check aria-hidden="true" weight="bold" className="shrink-0 text-ui-brand-text" /> : null}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <TextField
                  label={`${idx + 1}. ${q.question}`}
                  hint={q.why}
                  value={value}
                  onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
                  placeholder="Type your answer"
                />
              )}
            </li>
          );
        })}
      </ol>

      {submitError ? (
        <div role="alert">
          <Callout tone="bad" title={submitError} />
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-ui-sm text-ui-muted">
          {allAnswered ? "All answered." : `${unanswered} still to answer.`}
        </p>
        <Button
          type="submit"
          variant="secondary"
          fullWidth
          data-testid="clarification-submit"
          disabled={!allAnswered}
          loading={submitting}
          loadingLabel="Saving…"
        >
          Save answers
        </Button>
      </div>
    </form>
  );
}
