/**
 * Which new-look screen shows, the words on each, and the steps between
 * "Write my quote" and the saved draft:
 *
 *   choose → talk → review ┐
 *          → type ─────────┼─ Write my quote → checking → (asking…) → saving
 *          → scan ─────────┘
 *
 * The side effects (the clean-up request, submitting `createDraftQuote`)
 * stay in the component; this reducer decides when they happen and with
 * what text, so it is the part that is tested.
 */

import type { Clarification } from "@/lib/clarifications";
import type { ClarificationAnswer } from "../../_components/ClarificationModal";
import { appendAnswersToTranscript } from "../../_lib/quote-input";
import { firstScreen, readyToWrite, type Channel } from "./channels";
import { startAsking, type AskState, type AskStep } from "./clarify";
import type { WritingStep } from "./copy";

export type FlowScreen = "choose" | "talk" | "review" | "type" | "scan";

export interface FlowState {
  channels: Channel[];
  screen: FlowScreen;
  /** The words for each way in, kept while moving between screens. */
  texts: Record<Channel, string>;
  writing: WritingStep;
  /** The words being written up (what the check ran on). */
  pending: string;
  questions: Clarification[];
  ask: AskState | null;
  /** What gets saved: the words plus any answers. */
  finalText: string;
  /** The last check, reused if the same words are written up again. */
  checked: { text: string; questions: Clarification[] } | null;
  /** The words were put back on screen (a failed save, a reload, a visit back). */
  restored: boolean;
  /** A recording from before is being written down again (it was kept through a reload). */
  resumedRecording: boolean;
  /**
   * This tab's backup has been read (after hydration). Until then nothing is
   * written back, so the empty first render never wipes the words.
   */
  loaded: boolean;
  /** Bumped by "Start fresh": screens with their own state (the recorder, the plan reader) start over. */
  generation: number;
}

export type FlowEvent =
  | { type: "choose"; channel: Channel }
  | { type: "back" }
  | { type: "transcribed"; text: string }
  | { type: "sayAgain" }
  | { type: "edit"; channel: Channel; text: string }
  | { type: "write" }
  | { type: "checked"; text: string; questions: Clarification[] }
  | { type: "answer"; step: AskStep }
  | { type: "leaveQuestions" }
  | { type: "restore"; channel: Channel; text: string }
  /** The backup was read: the words to put back, or a recording to write down again. */
  | { type: "loaded"; words: { channel: Channel; text: string } | null; recording: boolean }
  /** Throw away what was put back and start the quote again. */
  | { type: "startFresh" };

/**
 * The opening state. `start` opens straight on one way in (Home's "Talk a
 * quote" tile) when that way is on offer; otherwise the usual first screen.
 */
export function initialFlowState(channels: Channel[], start?: Channel | null): FlowState {
  return {
    channels,
    screen: start && channels.includes(start) ? start : firstScreen(channels),
    texts: { talk: "", type: "", scan: "" },
    writing: "idle",
    pending: "",
    questions: [],
    ask: null,
    finalText: "",
    checked: null,
    restored: false,
    resumedRecording: false,
    loaded: false,
    generation: 0,
  };
}

/** The way in whose words a screen can write up (the talk screen itself has none yet). */
export function writableChannel(screen: FlowScreen): Channel | null {
  if (screen === "review") return "talk";
  if (screen === "type" || screen === "scan") return screen;
  return null;
}

export function activeText(state: FlowState): string {
  const channel = writableChannel(state.screen);
  return channel ? state.texts[channel] : "";
}

const KEEP_ORDER: readonly Channel[] = ["talk", "type", "scan"];

/**
 * The words a reload must not lose: the ones on screen, or (on the choice or
 * the mic) the words still held for another way in. Null when there are none.
 */
export function wordsToKeep(state: FlowState): { channel: Channel; text: string } | null {
  const current = writableChannel(state.screen);
  if (current && state.texts[current].trim()) return { channel: current, text: state.texts[current] };
  for (const channel of KEEP_ORDER) {
    if (state.texts[channel].trim()) return { channel, text: state.texts[channel] };
  }
  return null;
}

/** "Write my quote" works: a screen with words, enough of them, nothing already going. */
export function canWrite(state: FlowState): boolean {
  const channel = writableChannel(state.screen);
  return state.writing === "idle" && channel !== null && readyToWrite(channel, state.texts[channel]);
}

/** Back from a screen goes to the choice, when there is one to go back to. */
export function canGoBack(state: FlowState): boolean {
  return state.writing === "idle" && state.screen !== "choose" && state.channels.length > 1;
}

/**
 * The top bar's left button: a step back to the choice, "Cancel" out to Home
 * (on the choice itself, or when there was nothing to choose), or held still
 * while the quote is being started.
 */
export function backKind(state: FlowState): "step" | "cancel" | "locked" {
  if (state.writing === "checking" || state.writing === "saving") return "locked";
  return canGoBack(state) ? "step" : "cancel";
}

function saving(state: FlowState, finalText: string): FlowState {
  return { ...state, writing: "saving", finalText, ask: null };
}

function asking(state: FlowState, text: string, questions: Clarification[]): FlowState {
  return { ...state, writing: "asking", pending: text, questions, ask: startAsking(questions) };
}

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "choose": {
      if (state.writing !== "idle" || !state.channels.includes(event.channel)) return state;
      if (event.channel === "scan") {
        // The plan reader always opens on its photo step, so words from an
        // earlier scan must not be quoted unseen.
        return { ...state, screen: "scan", texts: { ...state.texts, scan: "" } };
      }
      const screen: FlowScreen =
        event.channel === "talk" ? (state.texts.talk.trim() ? "review" : "talk") : event.channel;
      return screen === state.screen ? state : { ...state, screen };
    }
    case "back":
      return canGoBack(state) ? { ...state, screen: "choose" } : state;
    case "transcribed":
      return state.screen === "talk" && state.writing === "idle"
        ? { ...state, screen: "review", texts: { ...state.texts, talk: event.text } }
        : state;
    case "sayAgain":
      return state.screen === "review" && state.writing === "idle"
        ? { ...state, screen: "talk", texts: { ...state.texts, talk: "" } }
        : state;
    case "edit":
      return state.writing === "idle" && state.texts[event.channel] !== event.text
        ? { ...state, texts: { ...state.texts, [event.channel]: event.text } }
        : state;
    case "write": {
      if (!canWrite(state)) return state;
      const text = activeText(state);
      if (state.checked && state.checked.text === text) {
        return state.checked.questions.length > 0
          ? asking(state, text, state.checked.questions)
          : saving({ ...state, pending: text }, text);
      }
      return { ...state, writing: "checking", pending: text };
    }
    case "checked": {
      if (state.writing !== "checking" || event.text !== state.pending) return state;
      const next = { ...state, checked: { text: event.text, questions: event.questions } };
      return event.questions.length > 0
        ? asking(next, event.text, event.questions)
        : saving(next, event.text);
    }
    case "answer": {
      if (state.writing !== "asking") return state;
      if (!event.step.done) return { ...state, ask: event.step.state };
      return saving(state, appendAnswersToTranscript(state.pending, state.questions, event.step.answers));
    }
    case "leaveQuestions":
      return state.writing === "asking" ? { ...state, writing: "idle", ask: null } : state;
    case "loaded": {
      if (state.loaded) return state;
      const loaded = { ...state, loaded: true };
      if (event.words && event.words.text.trim()) {
        return flowReducer(loaded, { type: "restore", channel: event.words.channel, text: event.words.text });
      }
      if (event.recording && state.channels.includes("talk") && state.writing === "idle") {
        return { ...loaded, screen: "talk", resumedRecording: true };
      }
      return loaded;
    }
    case "startFresh":
      if (state.writing !== "idle") return state;
      return { ...initialFlowState(state.channels), loaded: state.loaded, generation: state.generation + 1 };
    case "restore": {
      if (state.writing !== "idle" || !event.text.trim()) return state;
      // Plan-photo words were built by the scanner; they come back as typed
      // words to check. Talk comes back to its review screen when offered.
      const channel: Channel =
        event.channel === "talk" && state.channels.includes("talk") ? "talk" : "type";
      return {
        ...state,
        screen: channel === "talk" ? "review" : "type",
        texts: { ...state.texts, [channel]: event.text },
        restored: true,
      };
    }
  }
}

/** The final answers of "Skip the rest", as a finished step. */
export function finishedStep(answers: ClarificationAnswer[]): AskStep {
  return { done: true, answers };
}
