import { describe, expect, it } from "vitest";
import type { Clarification } from "@/lib/clarifications";
import { appendAnswersToTranscript } from "../../_lib/quote-input";
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
  questionProgress,
  questionsLeftAfter,
  sendDraft,
  skipQuestion,
  skipRest,
  startAsking,
  type AskState,
  type AskStep,
} from "./clarify";

const QUESTIONS: Clarification[] = [
  {
    id: "transcript.gib.12",
    question: "Which GIB did you mean?",
    why: "Different boards, different prices.",
    options: ["GIB Standard 10mm", "GIB Aqualine 13mm (wet area)"],
    source: "regex",
  },
  { id: "missing.0", question: "How high is the fence?", why: "", options: [], source: "missing_info" },
  {
    id: "compliance.0",
    question: "Confirm: consent needed over 1.5 m?",
    why: "Code-critical detail.",
    options: ["Confirmed — include as-is", "Need to discuss with client first"],
    source: "compliance_risk",
  },
];

function next(step: AskStep): AskState {
  if (step.done) throw new Error("expected another question");
  return step.state;
}

describe("one question per screen", () => {
  it("starts on the first question with its answer buttons (no box)", () => {
    const state = startAsking(QUESTIONS);
    expect(state).toEqual({ index: 0, answers: [null, null, null], drafts: ["", "", ""], writing: false });
    expect(questionProgress(QUESTIONS, state)).toBe("Question 1 of 3");
    expect(isOpenQuestion(QUESTIONS[0])).toBe(false);
    expect(isOpenQuestion(QUESTIONS[1])).toBe(true);
    expect(SOMETHING_ELSE).toBe("Something else");
  });

  it("a tap on an answer button answers and moves on; an open question opens its box", () => {
    const second = next(pickOption(QUESTIONS, startAsking(QUESTIONS), "GIB Standard 10mm"));
    expect(second.index).toBe(1);
    expect(second.answers[0]).toBe("GIB Standard 10mm");
    expect(second.writing).toBe(true);
    expect(questionsLeftAfter(QUESTIONS, second)).toBe(1);
  });

  it("typed answers need words, and are trimmed", () => {
    let state = next(pickOption(QUESTIONS, startAsking(QUESTIONS), "GIB Standard 10mm"));
    expect(canSendDraft(state)).toBe(false);
    expect(sendDraft(QUESTIONS, state)).toEqual({ done: false, state });
    state = editDraft(state, "  1.8 m  ");
    expect(draftOf(state)).toBe("  1.8 m  ");
    expect(canSendDraft(state)).toBe(true);
    const third = next(sendDraft(QUESTIONS, state));
    expect(third.answers[1]).toBe("1.8 m");
    expect(isLastQuestion(QUESTIONS, third)).toBe(true);
  });

  it("finishes with answers in the current modal's shape, ready for the job text", () => {
    let state = startAsking(QUESTIONS);
    state = next(pickOption(QUESTIONS, state, "GIB Aqualine 13mm (wet area)"));
    state = next(skipQuestion(QUESTIONS, state));
    const done = pickOption(QUESTIONS, state, "Confirmed — include as-is");
    expect(done).toEqual({
      done: true,
      answers: [
        { questionId: "transcript.gib.12", answer: "GIB Aqualine 13mm (wet area)" },
        { questionId: "missing.0", answer: null },
        { questionId: "compliance.0", answer: "Confirmed — include as-is" },
      ],
    });
    if (!done.done) throw new Error("expected done");
    expect(appendAnswersToTranscript("Bathroom reline", QUESTIONS, done.answers)).toBe(
      "Bathroom reline\n\n[Additional details confirmed by the tradie:]\n" +
        "- Which GIB did you mean? → GIB Aqualine 13mm (wet area)\n" +
        "- Confirm: consent needed over 1.5 m? → Confirmed — include as-is",
    );
  });

  it("Something else opens a box for a typed answer on a question with buttons", () => {
    const state = openBox(startAsking(QUESTIONS));
    expect(state.writing).toBe(true);
    expect(openBox(state)).toBe(state);
    const answered = next(sendDraft(QUESTIONS, editDraft(state, "Fyreline 13mm")));
    expect(answered.answers[0]).toBe("Fyreline 13mm");
  });

  it("Back shows the earlier answer again, box and all", () => {
    let state = startAsking(QUESTIONS);
    state = next(sendDraft(QUESTIONS, editDraft(openBox(state), "Fyreline 13mm")));
    state = editDraft(state, "1.2 m");
    const back = previousQuestion(QUESTIONS, state);
    expect(back).not.toBeNull();
    expect(back!.index).toBe(0);
    expect(back!.writing).toBe(true);
    expect(draftOf(back!)).toBe("Fyreline 13mm");
    expect(chosenOption(QUESTIONS, back!)).toBeNull();
    // The words typed on the later question are kept for when they come back.
    const forward = next(sendDraft(QUESTIONS, back!));
    expect(draftOf(forward)).toBe("1.2 m");
  });

  it("Back shows a chosen button as chosen, and leaves the questions from the first", () => {
    let state = startAsking(QUESTIONS);
    expect(previousQuestion(QUESTIONS, state)).toBeNull();
    state = next(pickOption(QUESTIONS, state, "GIB Standard 10mm"));
    const back = previousQuestion(QUESTIONS, state)!;
    expect(back.writing).toBe(false);
    expect(chosenOption(QUESTIONS, back)).toBe("GIB Standard 10mm");
  });

  it("Skip the rest keeps what's answered, including words typed on this question", () => {
    let state = startAsking(QUESTIONS);
    state = next(pickOption(QUESTIONS, state, "GIB Standard 10mm"));
    expect(skipRest(QUESTIONS, editDraft(state, "1.8 m"))).toEqual([
      { questionId: "transcript.gib.12", answer: "GIB Standard 10mm" },
      { questionId: "missing.0", answer: "1.8 m" },
      { questionId: "compliance.0", answer: null },
    ]);
    expect(skipRest(QUESTIONS, state).map((a) => a.answer)).toEqual(["GIB Standard 10mm", null, null]);
  });

  it("Skip the rest from an earlier question drops later answers, like the current modal", () => {
    let state = startAsking(QUESTIONS);
    state = next(pickOption(QUESTIONS, state, "GIB Standard 10mm"));
    state = next(sendDraft(QUESTIONS, editDraft(state, "1.8 m")));
    const back = previousQuestion(QUESTIONS, previousQuestion(QUESTIONS, state)!)!;
    expect(skipRest(QUESTIONS, back).map((a) => a.answer)).toEqual(["GIB Standard 10mm", null, null]);
  });
});
