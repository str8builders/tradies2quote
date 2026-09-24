/**
 * The clean-up pass's questions, one per screen (new look). Big answer
 * buttons answer and move on in one tap; "Something else" opens a box for a
 * typed answer; "Skip" leaves one out; "Skip the rest" writes the quote with
 * what's answered so far. The answers come out in the same shape the
 * current modal produces (null = skipped), so `appendAnswersToTranscript`
 * adds them to the job text exactly as it does today.
 *
 * Pure: every step returns a new state, or the finished answers.
 */

import type { Clarification } from "@/lib/clarifications";
import type { ClarificationAnswer } from "../../_components/ClarificationModal";

export const SOMETHING_ELSE = "Something else";

export interface AskState {
  index: number;
  /** One per question: the chosen option or typed answer; null = skipped or not reached. */
  answers: Array<string | null>;
  /** Typed text per question, kept while moving back and forth. */
  drafts: string[];
  /** The typing box is open on this question. */
  writing: boolean;
}

export type AskStep =
  | { done: false; state: AskState }
  | { done: true; answers: ClarificationAnswer[] };

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}

/** An open question has no answer buttons, only the typing box. */
export function isOpenQuestion(question: Clarification | undefined): boolean {
  return !question || question.options.length === 0;
}

/** Arrive on the question at `state.index`, reopening a typed answer given before. */
function enter(questions: readonly Clarification[], state: AskState): AskState {
  const question = questions[state.index];
  const saved = state.answers[state.index];
  const typedBefore = typeof saved === "string" && !(question?.options ?? []).includes(saved);
  const drafts =
    typedBefore && !state.drafts[state.index] ? replaceAt(state.drafts, state.index, saved) : state.drafts;
  return { ...state, drafts, writing: isOpenQuestion(question) || typedBefore };
}

export function startAsking(questions: readonly Clarification[]): AskState {
  return enter(questions, {
    index: 0,
    answers: questions.map(() => null),
    drafts: questions.map(() => ""),
    writing: false,
  });
}

function answersOf(questions: readonly Clarification[], answers: ReadonlyArray<string | null>): ClarificationAnswer[] {
  return questions.map((question, i) => ({ questionId: question.id, answer: answers[i] ?? null }));
}

function answerAndNext(questions: readonly Clarification[], state: AskState, answer: string | null): AskStep {
  const answers = replaceAt(state.answers, state.index, answer);
  const next = state.index + 1;
  if (next >= questions.length) return { done: true, answers: answersOf(questions, answers) };
  return { done: false, state: enter(questions, { ...state, answers, index: next, writing: false }) };
}

/** A tap on one of the big answer buttons: that's the answer, on to the next question. */
export function pickOption(questions: readonly Clarification[], state: AskState, option: string): AskStep {
  return answerAndNext(questions, state, option);
}

/** "Something else": open the box for a typed answer. */
export function openBox(state: AskState): AskState {
  return state.writing ? state : { ...state, writing: true };
}

export function draftOf(state: AskState): string {
  return state.drafts[state.index] ?? "";
}

export function editDraft(state: AskState, text: string): AskState {
  return { ...state, drafts: replaceAt(state.drafts, state.index, text) };
}

export function canSendDraft(state: AskState): boolean {
  return state.writing && draftOf(state).trim().length > 0;
}

/** "Next" under the box: the typed words are the answer. */
export function sendDraft(questions: readonly Clarification[], state: AskState): AskStep {
  if (!canSendDraft(state)) return { done: false, state };
  return answerAndNext(questions, state, draftOf(state).trim());
}

/** "Skip": no answer to this one. */
export function skipQuestion(questions: readonly Clarification[], state: AskState): AskStep {
  return answerAndNext(questions, state, null);
}

/**
 * "Skip the rest": keep the answers before this question and anything
 * typed or chosen on it, leave the rest out, and write the quote now.
 */
export function skipRest(questions: readonly Clarification[], state: AskState): ClarificationAnswer[] {
  const current = canSendDraft(state) ? draftOf(state).trim() : (state.answers[state.index] ?? null);
  const answers = state.answers.map((answer, i) =>
    i < state.index ? answer : i === state.index ? current : null,
  );
  return answersOf(questions, answers);
}

/** Back: the previous question, or null on the first one (leave the questions). */
export function previousQuestion(questions: readonly Clarification[], state: AskState): AskState | null {
  if (state.index <= 0) return null;
  return enter(questions, { ...state, index: state.index - 1, writing: false });
}

/** The answer button picked before, shown as chosen when coming back to a question. */
export function chosenOption(questions: readonly Clarification[], state: AskState): string | null {
  const saved = state.answers[state.index];
  return typeof saved === "string" && (questions[state.index]?.options ?? []).includes(saved) ? saved : null;
}

export function isLastQuestion(questions: readonly Clarification[], state: AskState): boolean {
  return state.index >= questions.length - 1;
}

export function questionsLeftAfter(questions: readonly Clarification[], state: AskState): number {
  return Math.max(0, questions.length - state.index - 1);
}

export function questionProgress(questions: readonly Clarification[], state: AskState): string {
  return `Question ${state.index + 1} of ${questions.length}`;
}
