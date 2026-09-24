"use client";

import type { ReactNode } from "react";
import { Camera, CaretRight, Microphone, PencilSimpleLine } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import type { Channel, ChannelChoice } from "./lib/channels";
import { FlowFrame, ScreenHeading, type BackControl } from "./parts";

const ICONS: Record<Channel, ReactNode> = {
  talk: <Microphone weight="fill" />,
  type: <PencilSimpleLine weight="bold" />,
  scan: <Camera weight="bold" />,
};

export interface ChooseScreenProps {
  choices: ChannelChoice[];
  onChoose: (channel: Channel) => void;
  back: BackControl;
  notice?: ReactNode;
  focusOnArrival: boolean;
}

/** Step one: three big ways in, each with one plain line. */
export function ChooseScreen({ choices, onChoose, back, notice, focusOnArrival }: ChooseScreenProps) {
  return (
    <FlowFrame title="New quote" back={back} screenKey="choose" focusOnArrival={focusOnArrival}>
      {notice}
      <ScreenHeading description="Pick how you want to tell us. You'll check everything before it goes anywhere.">
        What&apos;s the job?
      </ScreenHeading>
      <ul aria-label="Ways to start the quote" className="space-y-3">
        {choices.map((choice) => (
          <li key={choice.channel}>
            <button
              type="button"
              data-testid={`choose-${choice.channel}`}
              onClick={() => onChoose(choice.channel)}
              className={cx(
                "ui-focus-ring flex min-h-20 w-full items-center gap-4 rounded-ui-lg border-2 bg-ui-surface px-4 py-3 text-left shadow-ui-card",
                UI_TEXT,
                TAP,
                PRESS,
                choice.primary ? "border-ui-brand" : "border-ui-line",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-ui-md text-[1.625rem]",
                  choice.primary ? "bg-ui-brand text-ui-on-brand" : "bg-ui-brand-soft text-ui-brand-text",
                )}
              >
                {ICONS[choice.channel]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="ui-title block text-ui-lg text-ui-text">{choice.title}</span>
                <span className="block text-ui-base text-ui-muted">{choice.line}</span>
              </span>
              <CaretRight aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-faint" />
            </button>
          </li>
        ))}
      </ul>
    </FlowFrame>
  );
}
