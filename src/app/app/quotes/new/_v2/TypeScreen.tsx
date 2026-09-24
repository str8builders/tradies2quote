"use client";

import type { ReactNode } from "react";
import { notReadyHint, readyToWrite, typedHint } from "./lib/channels";
import type { WritingStep } from "./lib/copy";
import { FlowFrame, ScreenHeading, TextBox, WriteButton, writeActionHint, type BackControl } from "./parts";

/** Two example lines, as the empty box's placeholder. */
export const TYPE_PLACEHOLDER =
  "Deck off the back door, 6 m by 4 m, 140×32 kwila on H3.2 joists.\nAbout 3 days' work, plus a step down to the lawn.";

export interface TypeScreenProps {
  text: string;
  onChange: (text: string) => void;
  onWrite: () => void;
  writing: WritingStep;
  back: BackControl;
  notice?: ReactNode;
  focusOnArrival: boolean;
}

export function TypeScreen({ text, onChange, onWrite, writing, back, notice, focusOnArrival }: TypeScreenProps) {
  const ready = readyToWrite("type", text);
  return (
    <FlowFrame
      title="Type"
      back={back}
      screenKey="type"
      focusOnArrival={focusOnArrival}
      hint={writeActionHint(writing, ready ? undefined : notReadyHint("type"))}
      actions={<WriteButton step={writing} ready={ready} onWrite={onWrite} />}
    >
      {notice}
      <ScreenHeading description="A few lines is enough. Sizes and materials help most.">
        What&apos;s the job?
      </ScreenHeading>
      <TextBox
        label="The job, in your words"
        labelHidden
        value={text}
        onChange={onChange}
        placeholder={TYPE_PLACEHOLDER}
        hint={typedHint(text)}
        rows={7}
        readOnly={writing !== "idle"}
        testId="type-input"
      />
    </FlowFrame>
  );
}
