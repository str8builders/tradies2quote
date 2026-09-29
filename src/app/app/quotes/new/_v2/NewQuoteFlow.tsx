"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { useUnsavedInput } from "@/lib/unsaved-input";
import { createDraftQuote } from "../actions";
import { AiConsentModal } from "../_components/AiConsentModal";
import { requestClarifications } from "../_lib/quote-input";
import { ChooseScreen } from "./ChooseScreen";
import { QuestionScreen } from "./QuestionScreen";
import { ReviewScreen } from "./ReviewScreen";
import { ScanScreen } from "./ScanScreen";
import { TalkScreen } from "./TalkScreen";
import { TypeScreen } from "./TypeScreen";
import { availableChannels, channelChoices, type ChannelFlags } from "./lib/channels";
import type { AskStep } from "./lib/clarify";
import { KEPT_DETAIL, KEPT_RECORDING, KEPT_WORDS, RESTORED_NOTE, pageErrorMessage } from "./lib/copy";
import {
  activeText,
  backKind,
  flowReducer,
  initialFlowState,
  wordsToKeep,
  type FlowEvent,
} from "./lib/flow";
import { forgetRecording, forgetWords, keepWords, readRecording, readWords, sessionStore } from "./lib/saved-job";
import { KeptNotice, PageErrorNotice, type BackControl } from "./parts";

export interface NewQuoteFlowProps {
  /** iOS app and no AI consent on record yet: the consent modal comes first. */
  needsAiConsent: boolean;
  /** Transcription is configured (Talk is offered). */
  voiceEnabled: boolean;
  /** The drawing reader is configured (Photo of a plan is offered). */
  scanEnabled: boolean;
  /** This tradie may use the plan-set reader (Full set of plans is offered). */
  drawingsEnabled?: boolean;
  /** `?error=` from a failed `createDraftQuote`. */
  errorKey?: string;
  /** `?start=talk`: open straight on the mic (Home's "Talk a quote"). */
  start?: "talk" | null;
}

/**
 * The new-look new-quote flow (redesign phase 4), shown only when the
 * new-look switch is on. Same gates, inputs and hand-off as the current
 * tabs: the iOS AI-consent modal, the shared recording rules and routes,
 * the plan reader, the clean-up questions, and `createDraftQuote`, which
 * saves the words and opens the quote page where QuoteGenerator writes it.
 */
export function NewQuoteFlow({ needsAiConsent, voiceEnabled, scanEnabled, drawingsEnabled = false, errorKey, start }: NewQuoteFlowProps) {
  const [state, dispatch] = useReducer(
    flowReducer,
    { voiceEnabled, scanEnabled } satisfies ChannelFlags,
    (flags) => initialFlowState(availableChannels(flags), start),
  );
  // Local mirror so accepting hides the modal at once. The AI routes check
  // consent themselves, so this is only the tradie's view of it.
  const [consentBlocked, setConsentBlocked] = useState(needsAiConsent);
  // After the first move between screens, each new screen takes focus.
  const [moved, setMoved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const transcriptRef = useRef<HTMLInputElement>(null);

  // Whatever this tab kept (a reload after an update, a failed save that
  // comes back with ?error=draft-failed, a visit back within 30 minutes) is
  // put back. Browser storage is only readable after hydration, so this
  // belongs in an effect; nothing is written back until it has run.
  useEffect(() => {
    const storage = sessionStore();
    const now = Date.now();
    const words = readWords(storage, now);
    dispatch({ type: "loaded", words, recording: !words && readRecording(storage, now) !== null });
  }, []);

  // The words go into this tab's storage on every change, until the quote
  // page clears them once the draft exists (saved-job forgetSentJob).
  useEffect(() => {
    if (!state.loaded) return;
    keepWords(sessionStore(), wordsToKeep(state), Date.now(), state.writing === "saving");
  }, [state]);

  // Coming back to the app after an update doesn't reload the page under
  // words, a recording or a plan being read (StaleVersionReload).
  useUnsavedInput(state.screen !== "choose" || wordsToKeep(state) !== null, "new quote");

  function go(event: FlowEvent) {
    dispatch(event);
    setMoved(true);
  }

  /** Hand the final words to `createDraftQuote`, exactly as the current flow does. */
  function submit(finalText: string) {
    const form = formRef.current;
    const input = transcriptRef.current;
    if (!form || !input) return;
    input.value = finalText;
    // Marked as sent before the save goes: the quote page clears them.
    keepWords(sessionStore(), wordsToKeep(state), Date.now(), true);
    form.requestSubmit();
  }

  /** Clear what was kept from before and start the quote again. */
  function startFresh() {
    const storage = sessionStore();
    forgetWords(storage);
    forgetRecording(storage);
    go({ type: "startFresh" });
  }

  async function write() {
    const next = flowReducer(state, { type: "write" });
    if (next === state) return;
    const text = activeText(state);
    dispatch({ type: "write" });
    if (next.writing === "saving") {
      submit(next.finalText);
      return;
    }
    if (next.writing === "asking") {
      setMoved(true);
      return;
    }
    // Any clean-up failure comes back as no questions, and the job is saved.
    const questions = await requestClarifications(text);
    const checked = flowReducer(next, { type: "checked", text, questions });
    dispatch({ type: "checked", text, questions });
    if (checked.writing === "saving") submit(checked.finalText);
    else setMoved(true);
  }

  function answer(step: AskStep) {
    const next = flowReducer(state, { type: "answer", step });
    dispatch({ type: "answer", step });
    setMoved(true);
    if (next.writing === "saving") submit(next.finalText);
  }

  const errorMessage = pageErrorMessage(errorKey);
  const kept = state.restored ? KEPT_WORDS : state.resumedRecording ? KEPT_RECORDING : null;
  const notice =
    state.writing !== "idle" ? undefined : errorMessage ? (
      <PageErrorNotice message={errorMessage} restoredNote={state.restored ? RESTORED_NOTE : undefined} />
    ) : kept ? (
      <KeptNotice title={kept} detail={KEPT_DETAIL} onStartFresh={startFresh} />
    ) : undefined;
  const kind = backKind(state);
  const back: BackControl = kind === "step" ? { kind, onBack: () => go({ type: "back" }) } : { kind };
  const common = { back, notice, focusOnArrival: moved };

  let screen: ReactNode;
  if (state.writing === "asking" && state.ask) {
    screen = (
      <QuestionScreen
        questions={state.questions}
        ask={state.ask}
        onStep={answer}
        onBack={() => go({ type: "leaveQuestions" })}
        focusOnArrival={moved}
      />
    );
  } else if (state.screen === "talk") {
    screen = (
      <TalkScreen
        key={state.generation}
        {...common}
        onTranscript={(text) => go({ type: "transcribed", text })}
        onTypeInstead={() => go({ type: "choose", channel: "type" })}
      />
    );
  } else if (state.screen === "review") {
    screen = (
      <ReviewScreen
        {...common}
        transcript={state.texts.talk}
        onChange={(text) => dispatch({ type: "edit", channel: "talk", text })}
        onSayAgain={() => go({ type: "sayAgain" })}
        onWrite={() => void write()}
        writing={state.writing}
      />
    );
  } else if (state.screen === "type") {
    screen = (
      <TypeScreen
        {...common}
        text={state.texts.type}
        onChange={(text) => dispatch({ type: "edit", channel: "type", text })}
        onWrite={() => void write()}
        writing={state.writing}
      />
    );
  } else if (state.screen === "scan") {
    screen = (
      <ScanScreen
        key={state.generation}
        {...common}
        scanned={state.texts.scan}
        onScanned={(text) => dispatch({ type: "edit", channel: "scan", text })}
        onWrite={() => void write()}
        writing={state.writing}
      />
    );
  } else {
    screen = (
      <ChooseScreen
        {...common}
        choices={channelChoices({ voiceEnabled, scanEnabled })}
        onChoose={(channel) => go({ type: "choose", channel })}
        drawings={drawingsEnabled}
      />
    );
  }

  return (
    <>
      <AiConsentModal look="new" open={consentBlocked} onGranted={() => setConsentBlocked(false)} />
      {screen}
      <form ref={formRef} action={createDraftQuote} data-testid="new-quote-form">
        <input ref={transcriptRef} type="hidden" name="transcript" defaultValue="" />
      </form>
    </>
  );
}
