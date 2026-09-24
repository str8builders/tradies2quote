"use client";

import type { ReactNode } from "react";
import { Check, PencilSimpleLine } from "@phosphor-icons/react/dist/ssr";
import type { Clarification } from "@/lib/clarifications";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import {
  SOMETHING_ELSE,
  canSendDraft,
  chosenOption,
  draftOf,
  editDraft,
  isLastQuestion,
  isOpenQuestion,
  openBox,
  pickOption,
  previousQuestion,
  questionsLeftAfter,
  sendDraft,
  skipQuestion,
  skipRest,
  type AskState,
  type AskStep,
} from "./lib/clarify";
import { FlowFrame, ScreenHeading, TextBox } from "./parts";

function AnswerButton({
  label,
  chosen,
  icon,
  onClick,
  testId,
}: {
  label: string;
  chosen: boolean;
  icon?: ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onClick}
      data-testid={testId}
      className={cx(
        "ui-focus-ring flex min-h-14 w-full items-center gap-3 rounded-ui-lg border-2 px-4 py-3 text-left text-ui-base font-semibold",
        UI_TEXT,
        TAP,
        PRESS,
        chosen ? "border-ui-brand bg-ui-brand-soft" : "border-ui-line bg-ui-surface",
      )}
    >
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {chosen ? (
        <Check aria-hidden="true" weight="bold" className="shrink-0 text-[1.375rem] text-ui-brand-text" />
      ) : icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 text-[1.375rem] text-ui-muted">
          {icon}
        </span>
      ) : null}
    </button>
  );
}

export interface QuestionScreenProps {
  questions: Clarification[];
  ask: AskState;
  /** A move within the questions, or the finished answers. */
  onStep: (step: AskStep) => void;
  /** Back on the first question: leave the questions and change the words. */
  onBack: () => void;
  focusOnArrival: boolean;
}

/**
 * One clean-up question per screen, before the quote is written. Big answer
 * buttons answer and move on; "Something else" opens a box; "Skip" leaves
 * it out; "Skip the rest" writes the quote with what's answered.
 */
export function QuestionScreen({ questions, ask, onStep, onBack, focusOnArrival }: QuestionScreenProps) {
  const question = questions[ask.index];
  if (!question) return null;
  const open = isOpenQuestion(question);
  const last = isLastQuestion(questions, ask);
  const chosen = chosenOption(questions, ask);
  const left = questionsLeftAfter(questions, ask);
  const nextLabel = last ? "Write my quote" : "Next";
  const back = () => {
    const previous = previousQuestion(questions, ask);
    if (previous) onStep({ done: false, state: previous });
    else onBack();
  };

  return (
    <FlowFrame
      title="A few quick questions"
      subtitle={`${ask.index + 1} of ${questions.length}`}
      back={{ kind: "step", onBack: back }}
      screenKey={`question-${ask.index}`}
      focusOnArrival={focusOnArrival}
      actions={
        <>
          <Button variant="ghost" fullWidth onClick={() => onStep(skipQuestion(questions, ask))} data-testid="question-skip">
            Skip
          </Button>
          {ask.writing ? (
            <Button
              fullWidth
              disabled={!canSendDraft(ask)}
              onClick={() => onStep(sendDraft(questions, ask))}
              data-testid="question-next"
            >
              {nextLabel}
            </Button>
          ) : null}
        </>
      }
    >
      <ScreenHeading size="question" description={question.why || undefined}>
        {question.question}
      </ScreenHeading>
      {open ? null : (
        <ul aria-label="Answers" className="space-y-3">
          {question.options.map((option, i) => (
            <li key={option}>
              <AnswerButton
                label={option}
                chosen={chosen === option}
                onClick={() => onStep(pickOption(questions, ask, option))}
                testId={`question-option-${i}`}
              />
            </li>
          ))}
          <li>
            <AnswerButton
              label={SOMETHING_ELSE}
              chosen={ask.writing}
              icon={<PencilSimpleLine weight="bold" />}
              onClick={() => onStep({ done: false, state: openBox(ask) })}
              testId="question-something-else"
            />
          </li>
        </ul>
      )}
      {ask.writing ? (
        <TextBox
          label={open ? "Your answer" : "Tell us what it is"}
          value={draftOf(ask)}
          onChange={(text) => onStep({ done: false, state: editDraft(ask, text) })}
          rows={3}
          testId="question-answer"
        />
      ) : null}
      {left > 0 ? (
        <Button
          variant="ghost"
          fullWidth
          onClick={() => onStep({ done: true, answers: skipRest(questions, ask) })}
          data-testid="question-skip-rest"
        >
          Skip the rest and write my quote
        </Button>
      ) : null}
    </FlowFrame>
  );
}
