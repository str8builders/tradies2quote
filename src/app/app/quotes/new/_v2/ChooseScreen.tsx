"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Blueprint, Camera, CaretRight, Microphone, PencilSimpleLine } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import { DRAWINGS_CHOICE, type Channel, type ChannelChoice } from "./lib/channels";
import { FlowFrame, ScreenHeading, type BackControl } from "./parts";

const ICONS: Record<Channel, ReactNode> = {
  talk: <Microphone weight="fill" />,
  type: <PencilSimpleLine weight="bold" />,
  scan: <Camera weight="bold" />,
};

export interface ChooseScreenProps {
  choices: ChannelChoice[];
  onChoose: (channel: Channel) => void;
  /** The whole-drawing-set reader is offered too (it opens its own page). */
  drawings?: boolean;
  back: BackControl;
  notice?: ReactNode;
  focusOnArrival: boolean;
}

function rowClass(primary: boolean): string {
  return cx(
    "ui-focus-ring flex min-h-20 w-full items-center gap-4 rounded-ui-lg border-2 bg-ui-surface px-4 py-3 text-left shadow-ui-card",
    UI_TEXT,
    TAP,
    PRESS,
    primary ? "border-ui-brand" : "border-ui-line",
  );
}

function RowBody({ icon, title, line, primary }: { icon: ReactNode; title: string; line: string; primary: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-ui-md text-[1.625rem]",
          primary ? "bg-ui-brand text-ui-on-brand" : "bg-ui-brand-soft text-ui-brand-text",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="ui-title block text-ui-lg text-ui-text">{title}</span>
        <span className="block text-ui-base text-ui-muted">{line}</span>
      </span>
      <CaretRight aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-faint" />
    </>
  );
}

/** Step one: three big ways in, each with one plain line (and the full set of plans, when offered). */
export function ChooseScreen({ choices, onChoose, drawings = false, back, notice, focusOnArrival }: ChooseScreenProps) {
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
              className={rowClass(choice.primary)}
            >
              <RowBody icon={ICONS[choice.channel]} title={choice.title} line={choice.line} primary={choice.primary} />
            </button>
          </li>
        ))}
        {drawings ? (
          <li>
            <Link href={DRAWINGS_CHOICE.href} data-testid="choose-drawings" className={rowClass(false)}>
              <RowBody icon={<Blueprint weight="bold" />} title={DRAWINGS_CHOICE.title} line={DRAWINGS_CHOICE.line} primary={false} />
            </Link>
          </li>
        ) : null}
      </ul>
    </FlowFrame>
  );
}
