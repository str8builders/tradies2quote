// Markup contracts for the new-look new-quote screens: rendered to static
// HTML in node like the kit's tests. The interactive rules live in ./lib and
// are tested there.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ createDraftQuote: async () => undefined }));
vi.mock("../ai-consent-actions", () => ({ recordAiConsentAction: async () => ({ ok: true }) }));
// The plan reader is reused as it is; a stand-in shows what it was given.
vi.mock("../_components/ScanPanel", () => ({
  ScanPanel: ({ transcript }: { transcript: string }) =>
    createElement("section", { "data-testid": "scan-panel", "data-transcript": transcript }),
}));

import type { Clarification } from "@/lib/clarifications";
import { ChooseScreen } from "./ChooseScreen";
import { NewQuoteFlow } from "./NewQuoteFlow";
import { QuestionScreen } from "./QuestionScreen";
import { ReviewScreen } from "./ReviewScreen";
import { ScanScreen } from "./ScanScreen";
import { TalkScreen, TalkView, type TalkViewProps } from "./TalkScreen";
import { TYPE_PLACEHOLDER, TypeScreen } from "./TypeScreen";
import { channelChoices } from "./lib/channels";
import { editDraft, openBox, pickOption, startAsking, type AskStep } from "./lib/clarify";
import { INITIAL_RECORDER_STATE, type RecorderSnapshot } from "./lib/recorder";
import type { BackControl } from "./parts";

const noop = () => {};
const step: BackControl = { kind: "step", onBack: noop };
const html = (element: React.ReactElement) => renderToStaticMarkup(element);

/** The opening tag of the first element containing a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in the markup`).toBeGreaterThanOrEqual(0);
  const start = markup.lastIndexOf("<", at);
  return markup.slice(start, markup.indexOf(">", at) + 1);
}

describe("NewQuoteFlow", () => {
  const flow = (props: Partial<React.ComponentProps<typeof NewQuoteFlow>> = {}) =>
    html(<NewQuoteFlow needsAiConsent={false} voiceEnabled scanEnabled {...props} />);

  it("opens on the choice, with Cancel back to Home and the hidden form createDraftQuote reads", () => {
    const out = flow();
    expect(out).toContain('data-new-quote-screen="choose"');
    expect(out).toMatch(/<a [^>]*href="\/app"[^>]*>.*Cancel<\/a>/);
    expect(out).toContain('data-testid="new-quote-form"');
    expect(tag(out, 'name="transcript"')).toContain('type="hidden"');
    expect(out).not.toContain('data-testid="ai-consent-modal"');
    expect(out).not.toContain('role="alert"');
  });

  it("the iOS AI-consent modal comes first when consent is needed", () => {
    const out = flow({ needsAiConsent: true });
    expect(out).toContain('data-testid="ai-consent-modal"');
    expect(out).toContain("Tradies2Quote uses AI");
    expect(out).toContain('data-testid="ai-consent-accept"');
    // The flow is there underneath, exactly as the current tabs are.
    expect(out).toContain('data-new-quote-screen="choose"');
  });

  it("shows the page's errors in plain words, and nothing for unknown ones", () => {
    expect(flow({ errorKey: "draft-failed" })).toContain(
      "We couldn&#x27;t start that quote. Check your internet connection and try again.",
    );
    const missing = flow({ errorKey: "missing-transcript" });
    expect(tag(missing, 'data-testid="new-quote-error"')).toContain('role="alert"');
    expect(missing).toContain("Tell us about the job first, then tap Write my quote.");
    expect(flow({ errorKey: "made-up" })).not.toContain('data-testid="new-quote-error"');
  });

  it("offers only the configured ways in", () => {
    const noScan = flow({ scanEnabled: false });
    expect(noScan).toContain('data-testid="choose-talk"');
    expect(noScan).not.toContain('data-testid="choose-scan"');
    const noVoice = flow({ voiceEnabled: false });
    expect(noVoice).not.toContain('data-testid="choose-talk"');
    expect(noVoice).toContain('data-testid="choose-scan"');
  });

  it("with typing as the only way in, opens straight on it", () => {
    const out = flow({ voiceEnabled: false, scanEnabled: false });
    expect(out).toContain('data-new-quote-screen="type"');
    expect(out).toMatch(/href="\/app"[^>]*>.*Cancel/);
    expect(out).not.toContain('data-testid="choose-type"');
  });
});

describe("ChooseScreen", () => {
  it("three big choices, each a title and one plain line, the first one orange", () => {
    const out = html(
      <ChooseScreen
        choices={channelChoices({ voiceEnabled: true, scanEnabled: true })}
        onChoose={noop}
        back={{ kind: "cancel" }}
        focusOnArrival={false}
      />,
    );
    for (const [id, title, line] of [
      ["talk", "Talk", "Say the job like you&#x27;d tell a mate."],
      ["type", "Type", "A few lines is enough."],
      ["scan", "Photo of a plan", "Snap the drawing and we&#x27;ll count the materials."],
    ]) {
      const button = tag(out, `data-testid="choose-${id}"`);
      expect(button).toContain('type="button"');
      expect(button).toContain("min-h-20");
      expect(out).toContain(`>${title}</span>`);
      expect(out).toContain(`>${line}</span>`);
    }
    expect(tag(out, 'data-testid="choose-talk"')).toContain("border-ui-brand");
    expect(tag(out, 'data-testid="choose-type"')).toContain("border-ui-line");
    expect(out).toContain("What&#x27;s the job?");
  });
});

describe("TalkView", () => {
  const view = (state: Partial<RecorderSnapshot>, extra: Partial<TalkViewProps> = {}) =>
    html(
      <TalkView
        state={{ ...INITIAL_RECORDER_STATE, stream: null, ...state }}
        back={step}
        focusOnArrival={false}
        onMic={noop}
        onDone={noop}
        onStartAgain={noop}
        onTryAgain={noop}
        onTypeInstead={noop}
        {...extra}
      />,
    );
  const fakeStream = {} as MediaStream;

  it("ready: a big mic, flat bars and one big Start talking", () => {
    const out = view({});
    const mic = tag(out, 'data-testid="talk-mic"');
    expect(mic).toContain('aria-label="Start recording"');
    expect(mic).toContain("h-30 w-30");
    expect(mic).not.toContain("disabled");
    expect(out).toContain('data-bars="silent"');
    expect(out).toContain("Tap the mic to start.");
    expect(out).toContain("Up to 3 minutes.");
    expect(tag(out, 'data-testid="talk-start"')).toContain("min-h-14");
    expect(out).toContain("Say the job like you&#x27;d tell a mate.");
  });

  it("opening the mic: the mic waits and the button says why", () => {
    const out = view({ phase: "starting" });
    expect(tag(out, 'data-testid="talk-mic"')).toContain("disabled");
    expect(tag(out, 'data-testid="talk-start"')).toContain('aria-busy="true"');
    expect(out).toContain("Getting the mic ready…");
    expect(out).toContain("If your phone asks, allow the microphone.");
  });

  it("listening: the timer, I'm listening, live bars, Start again and Done", () => {
    const out = view({ phase: "recording", seconds: 42, canPause: true, stream: fakeStream });
    expect(out).toMatch(/I&#x27;m listening · <span class="tabular-nums">0:42<\/span>/);
    expect(out).toContain('data-bars="live"');
    expect(tag(out, 'data-testid="talk-mic"')).toContain('aria-label="Pause recording"');
    expect(tag(out, 'data-testid="talk-start-again"')).toContain("min-h-12");
    expect(tag(out, 'data-testid="talk-done"')).toContain("min-h-14");
    expect(out).toContain("Tap Done when you&#x27;ve finished.");
    // The level bars are 24 transforms, drawn without re-rendering.
    expect(out.match(/style="transform:scaleY\(/g)).toHaveLength(24);
    expect(out).toContain("motion-reduce:transition-none");
  });

  it("near the limit it counts down", () => {
    expect(view({ phase: "recording", seconds: 150, stream: fakeStream })).toContain("30 seconds left");
  });

  it("without a stream to measure, the bars hold a still shape", () => {
    expect(view({ phase: "recording", seconds: 3, stream: null })).toContain('data-bars="resting"');
  });

  it("paused: flat bars, the clock held, and the mic carries on", () => {
    const out = view({ phase: "paused", seconds: 10, canPause: true, stream: fakeStream });
    expect(out).toMatch(/Paused · <span class="tabular-nums">0:10<\/span>/);
    expect(out).toContain('data-bars="silent"');
    expect(tag(out, 'data-testid="talk-mic"')).toContain('aria-label="Carry on recording"');
    expect(out).toContain('data-testid="talk-done"');
  });

  it("writing it down: honest wording while the recording is sent", () => {
    const out = view({ phase: "transcribing", seconds: 30 });
    expect(out).toContain("Writing down what you said…");
    expect(out).toContain("Writing it down…");
    expect(tag(out, 'data-testid="talk-mic"')).toContain("disabled");
  });

  it("a problem: the plain message, Try again and Type it instead", () => {
    const out = view({ phase: "error", error: "No internet connection. Check your signal and try again." });
    expect(tag(out, 'data-testid="talk-error"')).toContain('role="alert"');
    expect(out).toContain("No internet connection. Check your signal and try again.");
    expect(tag(out, 'data-testid="talk-try-again"')).toContain("min-h-14");
    expect(out).toContain('data-testid="talk-type-instead"');
  });

  it("the real screen renders on the server without touching the microphone", () => {
    const out = html(
      <TalkScreen back={step} focusOnArrival={false} onTranscript={noop} onTypeInstead={noop} />,
    );
    expect(out).toContain('data-phase="idle"');
    expect(out).toContain('data-bars="silent"');
  });
});

describe("ReviewScreen", () => {
  const review = (transcript: string, writing: "idle" | "checking" | "saving" = "idle") =>
    html(
      <ReviewScreen
        transcript={transcript}
        onChange={noop}
        onSayAgain={noop}
        onWrite={noop}
        writing={writing}
        back={step}
        focusOnArrival={false}
      />,
    );

  it("reads the words back with sizes and amounts highlighted, above a big box to fix them", () => {
    const out = review("Deck 6 m by 4 m, 90x45 H3.2 joists");
    expect(out).toContain("Did I hear you right?");
    expect(tag(out, 'data-testid="transcript-highlighted"')).toContain('aria-hidden="true"');
    expect(out.match(/<mark /g)).toHaveLength(4);
    expect(out).toContain("bg-ui-mark");
    const box = tag(out, 'data-testid="transcript-output"');
    expect(box).toMatch(/^<textarea/);
    expect(out).toContain("Deck 6 m by 4 m, 90x45 H3.2 joists</textarea>");
    expect(out).toContain("Fix anything that&#x27;s wrong");
    const write = tag(out, 'data-testid="write-quote"');
    expect(write).toContain("min-h-14");
    expect(write).not.toContain("disabled");
    expect(out).toContain(">Write my quote</span>");
    expect(out).toContain("Say it again");
  });

  it("without sizes, just the box", () => {
    const out = review("Paint the fence");
    expect(out).not.toContain('data-testid="transcript-highlighted"');
    expect(out).toContain("What you said");
  });

  it("while checking: busy button, honest hint, words locked", () => {
    const out = review("Deck 6 m by 4 m", "checking");
    expect(tag(out, 'data-testid="write-quote"')).toContain('aria-busy="true"');
    expect(out).toContain("Checking the details…");
    expect(out).toContain("Looking for anything I should ask you first.");
    expect(tag(out, 'data-testid="transcript-output"')).toContain("readOnly");
    expect(tag(out, 'data-testid="review-say-again"')).toContain("disabled");
  });

  it("while saving says so", () => {
    const out = review("Deck", "saving");
    expect(out).toContain("Starting your quote…");
    expect(out).toContain("Saving your job details.");
  });
});

describe("TypeScreen", () => {
  const typed = (text: string) =>
    html(<TypeScreen text={text} onChange={noop} onWrite={noop} writing="idle" back={step} focusOnArrival={false} />);

  it("a big box with two example lines, and the minimum explained kindly", () => {
    const out = typed("");
    const box = tag(out, 'data-testid="type-input"');
    expect(TYPE_PLACEHOLDER.split("\n")).toHaveLength(2);
    expect(box).toContain(`placeholder="${TYPE_PLACEHOLDER.replace(/'/g, "&#x27;")}"`);
    expect(out).toContain("A sentence is enough to get started.");
    expect(tag(out, 'data-testid="write-quote"')).toContain("disabled");
    expect(out).toContain("Add a few more words first.");
  });

  it("goes once there's enough", () => {
    const out = typed("Deck 6 m by 4 m off the back door");
    expect(tag(out, 'data-testid="write-quote"')).not.toContain("disabled");
    expect(out).not.toContain("Add a few more words first.");
    expect(out).toContain("That&#x27;s enough to write a quote.");
  });
});

describe("ScanScreen", () => {
  const scan = (scanned: string, writing: "idle" | "checking" = "idle") =>
    html(
      <ScanScreen
        scanned={scanned}
        onScanned={noop}
        onWrite={noop}
        writing={writing}
        back={step}
        focusOnArrival={false}
      />,
    );

  it("wraps the current plan reader, labelled by the screen's heading", () => {
    const out = scan("");
    expect(tag(out, 'id="tab-scan"')).toMatch(/^<h2/);
    expect(out).toContain('data-testid="scan-panel" data-transcript=""');
    expect(tag(out, 'data-testid="write-quote"')).toContain("disabled");
    expect(out).toContain("Take or upload a photo of the plan first.");
  });

  it("goes once the plan's words are checked, and locks the reader while writing", () => {
    expect(tag(scan("Framing 40 m"), 'data-testid="write-quote"')).not.toContain("disabled");
    expect(tag(scan("Framing 40 m", "checking"), 'data-testid="scan-panel-wrap"')).toContain("inert");
  });
});

describe("QuestionScreen", () => {
  const QUESTIONS: Clarification[] = [
    {
      id: "transcript.gib.1",
      question: "Which GIB did you mean?",
      why: "Different boards, different prices.",
      options: ["GIB Standard 10mm", "GIB Aqualine 13mm (wet area)"],
      source: "regex",
    },
    { id: "missing.0", question: "How high is the fence?", why: "", options: [], source: "missing_info" },
  ];
  const screen = (ask = startAsking(QUESTIONS)) =>
    html(<QuestionScreen questions={QUESTIONS} ask={ask} onStep={noop} onBack={noop} focusOnArrival={false} />);
  const after = (s: AskStep) => {
    if (s.done) throw new Error("expected a question");
    return s.state;
  };

  it("one question with big answer buttons, Something else, Skip and Skip the rest", () => {
    const out = screen();
    expect(out).toContain("1 of 2");
    expect(out).toContain("Which GIB did you mean?");
    expect(out).toContain("Different boards, different prices.");
    for (const id of ["question-option-0", "question-option-1", "question-something-else"]) {
      const button = tag(out, `data-testid="${id}"`);
      expect(button).toContain("min-h-14");
      expect(button).toContain('aria-pressed="false"');
    }
    expect(out).toContain(">Something else</span>");
    expect(tag(out, 'data-testid="question-skip"')).toContain("min-h-12");
    expect(out).toContain("Skip the rest and write my quote");
    expect(out).not.toContain('data-testid="question-next"');
  });

  it("Something else opens the box, and Next waits for words", () => {
    const writing = openBox(startAsking(QUESTIONS));
    const out = screen(writing);
    expect(tag(out, 'data-testid="question-something-else"')).toContain('aria-pressed="true"');
    expect(out).toContain('data-testid="question-answer"');
    expect(tag(out, 'data-testid="question-next"')).toContain("disabled");
    expect(tag(screen(editDraft(writing, "Fyreline")), 'data-testid="question-next"')).not.toContain("disabled");
  });

  it("the last question writes the quote, and has no Skip the rest", () => {
    const last = after(pickOption(QUESTIONS, startAsking(QUESTIONS), "GIB Standard 10mm"));
    const out = screen(last);
    expect(out).toContain("2 of 2");
    expect(out).toContain('data-testid="question-answer"');
    expect(out).toContain(">Write my quote</span>");
    expect(out).not.toContain("Skip the rest");
  });
});
