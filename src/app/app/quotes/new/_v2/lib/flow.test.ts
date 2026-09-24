import { describe, expect, it } from "vitest";
import type { Clarification } from "@/lib/clarifications";
import { appendAnswersToTranscript } from "../../_lib/quote-input";
import { pickOption } from "./clarify";
import {
  activeText,
  backKind,
  canGoBack,
  canWrite,
  flowReducer,
  initialFlowState,
  writableChannel,
  type FlowEvent,
  type FlowState,
} from "./flow";

const ALL = initialFlowState(["talk", "type", "scan"]);
const QUESTION: Clarification = {
  id: "transcript.gib.3",
  question: "Which GIB?",
  why: "",
  options: ["GIB Standard 10mm"],
  source: "regex",
};
const TYPED = "Deck 6 m by 4 m off the back door, kwila boards";

function run(state: FlowState, ...events: FlowEvent[]): FlowState {
  return events.reduce(flowReducer, state);
}

describe("moving between screens", () => {
  it("opens on the choice, or straight on typing when that's the only way in", () => {
    expect(ALL.screen).toBe("choose");
    expect(initialFlowState(["type"]).screen).toBe("type");
    expect(initialFlowState(["type", "scan"]).screen).toBe("choose");
  });

  it("goes to the chosen screen and back to the choice", () => {
    const typing = run(ALL, { type: "choose", channel: "type" });
    expect(typing.screen).toBe("type");
    expect(canGoBack(typing)).toBe(true);
    expect(backKind(typing)).toBe("step");
    expect(run(typing, { type: "back" }).screen).toBe("choose");
    expect(backKind(ALL)).toBe("cancel");
    expect(canGoBack(ALL)).toBe(false);
  });

  it("never offers a way in that isn't configured", () => {
    const noVoice = initialFlowState(["type", "scan"]);
    expect(run(noVoice, { type: "choose", channel: "talk" })).toBe(noVoice);
  });

  it("with one way in, the top bar cancels out instead of stepping back", () => {
    const only = initialFlowState(["type"]);
    expect(backKind(only)).toBe("cancel");
    expect(run(only, { type: "back" })).toBe(only);
  });

  it("talk → review with the words; Say it again goes back to the mic with them cleared", () => {
    const talking = run(ALL, { type: "choose", channel: "talk" });
    expect(talking.screen).toBe("talk");
    expect(writableChannel("talk")).toBeNull();
    expect(canWrite(talking)).toBe(false);
    const review = run(talking, { type: "transcribed", text: "Deck 6 by 4" });
    expect(review.screen).toBe("review");
    expect(activeText(review)).toBe("Deck 6 by 4");
    // Words stay while wandering off and back.
    expect(run(review, { type: "back" }, { type: "choose", channel: "talk" }).screen).toBe("review");
    const again = run(review, { type: "sayAgain" });
    expect(again.screen).toBe("talk");
    expect(again.texts.talk).toBe("");
  });

  it("a late transcript for a screen already left is ignored", () => {
    const typing = run(ALL, { type: "choose", channel: "type" });
    expect(run(typing, { type: "transcribed", text: "late" })).toBe(typing);
  });

  it("reopening Photo of a plan starts clean, like the plan reader does", () => {
    const scanned = run(ALL, { type: "choose", channel: "scan" }, { type: "edit", channel: "scan", text: "Framing 40 m" });
    expect(canWrite(scanned)).toBe(true);
    const reopened = run(scanned, { type: "back" }, { type: "choose", channel: "scan" });
    expect(reopened.texts.scan).toBe("");
    expect(canWrite(reopened)).toBe(false);
  });
});

describe("Write my quote", () => {
  const typed = run(ALL, { type: "choose", channel: "type" }, { type: "edit", channel: "type", text: TYPED });

  it("needs enough words first", () => {
    const short = run(ALL, { type: "choose", channel: "type" }, { type: "edit", channel: "type", text: "Deck" });
    expect(canWrite(short)).toBe(false);
    expect(run(short, { type: "write" })).toBe(short);
    expect(canWrite(typed)).toBe(true);
  });

  it("checks first, then saves the words as they are when there's nothing to ask", () => {
    const checking = run(typed, { type: "write" });
    expect(checking).toMatchObject({ writing: "checking", pending: TYPED });
    expect(backKind(checking)).toBe("locked");
    expect(canWrite(checking)).toBe(false);
    // Words can't change under the check.
    expect(run(checking, { type: "edit", channel: "type", text: "changed" })).toBe(checking);
    const saving = run(checking, { type: "checked", text: TYPED, questions: [] });
    expect(saving).toMatchObject({ writing: "saving", finalText: TYPED });
    expect(backKind(saving)).toBe("locked");
  });

  it("asks the questions, then saves the words with the answers added", () => {
    const asking = run(typed, { type: "write" }, { type: "checked", text: TYPED, questions: [QUESTION] });
    expect(asking.writing).toBe("asking");
    expect(asking.ask?.index).toBe(0);
    const done = pickOption([QUESTION], asking.ask!, "GIB Standard 10mm");
    const saving = run(asking, { type: "answer", step: done });
    expect(saving.writing).toBe("saving");
    expect(saving.finalText).toBe(
      appendAnswersToTranscript(TYPED, [QUESTION], [{ questionId: QUESTION.id, answer: "GIB Standard 10mm" }]),
    );
  });

  it("Back from the first question returns to the words, and the same words skip a second check", () => {
    const asking = run(typed, { type: "write" }, { type: "checked", text: TYPED, questions: [QUESTION] });
    const left = run(asking, { type: "leaveQuestions" });
    expect(left).toMatchObject({ writing: "idle", ask: null, screen: "type" });
    const again = run(left, { type: "write" });
    expect(again.writing).toBe("asking");
    const changed = run(left, { type: "edit", channel: "type", text: `${TYPED}, stained` }, { type: "write" });
    expect(changed.writing).toBe("checking");
  });

  it("ignores a check that answers for different words or arrives late", () => {
    const checking = run(typed, { type: "write" });
    expect(run(checking, { type: "checked", text: "other words", questions: [] })).toBe(checking);
    expect(run(typed, { type: "checked", text: TYPED, questions: [] })).toBe(typed);
  });
});

describe("after a failed save", () => {
  it("puts spoken words back on the review screen, other words on the typing screen", () => {
    const talk = run(ALL, { type: "restore", channel: "talk", text: "Deck 6 by 4" });
    expect(talk).toMatchObject({ screen: "review", restored: true });
    expect(talk.texts.talk).toBe("Deck 6 by 4");
    const scan = run(ALL, { type: "restore", channel: "scan", text: "Framing 40 m" });
    expect(scan).toMatchObject({ screen: "type", restored: true });
    expect(scan.texts.type).toBe("Framing 40 m");
    const noVoice = run(initialFlowState(["type"]), { type: "restore", channel: "talk", text: "Deck" });
    expect(noVoice.screen).toBe("type");
    expect(run(ALL, { type: "restore", channel: "type", text: "   " })).toBe(ALL);
  });
});
