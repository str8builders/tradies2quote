"use client";

import type { ReactNode } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hasHighlights, splitTranscript } from "@/lib/highlightDimensions";
import { notReadyHint, readyToWrite } from "./lib/channels";
import type { WritingStep } from "./lib/copy";
import { FlowFrame, ScreenHeading, TextBox, WriteButton, writeActionHint, type BackControl } from "./parts";

/**
 * What was heard, read back with the sizes and amounts highlighted (the
 * places a mishearing turns into a wrong quote), above a big box to fix it.
 * The highlighted copy is for eyes only; screen readers get the box.
 */
export function HighlightedWords({ text }: { text: string }) {
  return (
    <Card aria-hidden="true" data-testid="transcript-highlighted">
      <p className="text-ui-lg break-words whitespace-pre-wrap">
        {splitTranscript(text).map((segment, i) =>
          segment.kind === "highlight" ? (
            <mark key={i} className="rounded-ui-sm bg-ui-mark px-1 font-semibold text-ui-on-mark">
              {segment.value}
            </mark>
          ) : (
            <span key={i}>{segment.value}</span>
          ),
        )}
      </p>
    </Card>
  );
}

export interface ReviewScreenProps {
  transcript: string;
  onChange: (text: string) => void;
  onSayAgain: () => void;
  onWrite: () => void;
  writing: WritingStep;
  back: BackControl;
  notice?: ReactNode;
  focusOnArrival: boolean;
}

export function ReviewScreen({
  transcript,
  onChange,
  onSayAgain,
  onWrite,
  writing,
  back,
  notice,
  focusOnArrival,
}: ReviewScreenProps) {
  const highlights = hasHighlights(transcript);
  const ready = readyToWrite("talk", transcript);
  const busy = writing !== "idle";
  return (
    <FlowFrame
      title="Check what you said"
      back={back}
      screenKey="review"
      focusOnArrival={focusOnArrival}
      hint={writeActionHint(writing, ready ? undefined : notReadyHint("talk"))}
      actions={
        <>
          <Button
            variant="ghost"
            fullWidth
            icon={<ArrowCounterClockwise weight="bold" />}
            onClick={onSayAgain}
            disabled={busy}
            data-testid="review-say-again"
          >
            Say it again
          </Button>
          <WriteButton step={writing} ready={ready} onWrite={onWrite} />
        </>
      }
    >
      {notice}
      <ScreenHeading
        description={
          highlights
            ? "Sizes and amounts are highlighted. That's where a slip makes a wrong quote."
            : "Read it back and fix anything that's wrong."
        }
      >
        Did I hear you right?
      </ScreenHeading>
      {highlights ? <HighlightedWords text={transcript} /> : null}
      <TextBox
        label={highlights ? "Fix anything that's wrong" : "What you said"}
        value={transcript}
        onChange={onChange}
        rows={6}
        readOnly={busy}
        testId="transcript-output"
      />
    </FlowFrame>
  );
}
