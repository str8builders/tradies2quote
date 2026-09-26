"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
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
import { RESTORED_NOTE, pageErrorMessage } from "./lib/copy";
import {
  activeText,
  backKind,
  flowReducer,
  initialFlowState,
  writableChannel,
  type FlowEvent,
} from "./lib/flow";
import { forgetWords, rememberWords, sessionStore, takeWords } from "./lib/saved-job";
import { PageErrorNotice, type BackControl } from "./parts";

export interface NewQuoteFlowProps {
  /** iOS app and no AI consent on record yet: the consent modal comes first. */
  needsAiConsent: boolean;
  /** Transcription is configured (Talk is offered). */
  voiceEnabled: boolean;
  /** The drawing reader is configured (Photo of a plan is offered). */
  scanEnabled: boolean;
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
export function NewQuoteFlow({ needsAiConsent, voiceEnabled, scanEnabled, errorKey, start }: NewQuoteFlowProps) {
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

  // A failed save remounts this page with ?error=draft-failed: put the words
  // back. Any other visit drops words left from an earlier attempt.
  useEffect(() => {
    const storage = sessionStore();
    if (errorKey !== "draft-failed") {
      forgetWords(storage);
      return;
    }
    // Browser storage is only readable after hydration, so this belongs in an effect.
    const saved = takeWords(storage, Date.now());
    if (saved) dispatch({ type: "restore", channel: saved.channel, text: saved.text });
  }, [errorKey]);

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
    form.requestSubmit();
  }

  async function write() {
    const next = flowReducer(state, { type: "write" });
    if (next === state) return;
    const channel = writableChannel(state.screen);
    const text = activeText(state);
    if (channel) rememberWords(sessionStore(), { channel, text, at: Date.now() });
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
  const notice =
    errorMessage && state.writing === "idle" ? (
      <PageErrorNotice message={errorMessage} restoredNote={state.restored ? RESTORED_NOTE : undefined} />
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
