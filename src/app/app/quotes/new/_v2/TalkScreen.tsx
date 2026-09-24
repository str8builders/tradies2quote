"use client";

import type { ReactNode } from "react";
import {
  ArrowCounterClockwise,
  Check,
  Microphone,
  Pause,
  PencilSimpleLine,
  SpinnerGap,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP } from "@/components/ui/styles";
import { MicLevelBars } from "./MicLevelBars";
import { formatClock, micButtonLabel, talkStatus } from "./lib/copy";
import type { RecorderSnapshot } from "./lib/recorder";
import { FlowFrame, ScreenHeading, type BackControl } from "./parts";
import { useVoiceRecorder } from "./useVoiceRecorder";

export interface TalkViewProps {
  state: RecorderSnapshot;
  back: BackControl;
  notice?: ReactNode;
  focusOnArrival: boolean;
  onMic: () => void;
  onDone: () => void;
  onStartAgain: () => void;
  onTryAgain: () => void;
  onTypeInstead: () => void;
}

/** The talk screen as it looks for a recorder state (no browser work here). */
export function TalkView({
  state,
  back,
  notice,
  focusOnArrival,
  onMic,
  onDone,
  onStartAgain,
  onTryAgain,
  onTypeInstead,
}: TalkViewProps) {
  const { phase, seconds, canPause } = state;
  const listening = phase === "recording";
  const busy = phase === "starting" || phase === "transcribing" || phase === "review";
  const { status, detail } = talkStatus(phase, seconds);
  const showClock = phase === "recording" || phase === "paused";

  const actions =
    phase === "recording" || phase === "paused" ? (
      <>
        <Button
          variant="ghost"
          fullWidth
          icon={<ArrowCounterClockwise weight="bold" />}
          onClick={onStartAgain}
          data-testid="talk-start-again"
        >
          Start again
        </Button>
        <Button fullWidth icon={<Check weight="bold" />} onClick={onDone} data-testid="talk-done">
          Done
        </Button>
      </>
    ) : phase === "error" ? (
      <>
        <Button
          variant="ghost"
          fullWidth
          icon={<PencilSimpleLine weight="bold" />}
          onClick={onTypeInstead}
          data-testid="talk-type-instead"
        >
          Type it instead
        </Button>
        <Button fullWidth onClick={onTryAgain} data-testid="talk-try-again">
          Try again
        </Button>
      </>
    ) : (
      <Button
        fullWidth
        icon={<Microphone weight="fill" />}
        onClick={onMic}
        loading={busy}
        loadingLabel={phase === "starting" ? "Getting the mic ready…" : "Writing it down…"}
        data-testid="talk-start"
      >
        Start talking
      </Button>
    );

  return (
    <FlowFrame title="Talk" back={back} screenKey="talk" focusOnArrival={focusOnArrival} actions={actions}>
      {notice}
      <ScreenHeading>Say the job like you&apos;d tell a mate.</ScreenHeading>
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <button
          type="button"
          onClick={onMic}
          disabled={busy}
          aria-label={micButtonLabel(phase, canPause)}
          data-testid="talk-mic"
          data-phase={phase}
          className={cx(
            "ui-focus-ring inline-flex h-30 w-30 shrink-0 items-center justify-center rounded-full bg-ui-brand text-[3rem] text-ui-on-brand shadow-[0_0_0_12px_var(--ui-brand-soft),0_0_0_26px_var(--ui-surface)]",
            TAP,
            busy ? "cursor-progress" : PRESS,
          )}
        >
          {busy ? (
            <SpinnerGap aria-hidden="true" weight="bold" className="animate-spin motion-reduce:animate-none" />
          ) : phase === "paused" ? (
            <Pause aria-hidden="true" weight="fill" />
          ) : (
            <Microphone aria-hidden="true" weight="fill" />
          )}
        </button>
        <MicLevelBars stream={state.stream} listening={listening} />
        <div aria-live="polite" className="space-y-1">
          <p className="ui-title text-ui-lg text-ui-text" data-testid="talk-status">
            {showClock ? (
              <>
                {status} · <span className="tabular-nums">{formatClock(seconds)}</span>
              </>
            ) : (
              status
            )}
          </p>
          {detail ? <p className="text-ui-base text-ui-muted">{detail}</p> : null}
        </div>
      </div>
      {phase === "error" && state.error ? (
        <div role="alert" data-testid="talk-error">
          <Callout tone="bad" title={state.error} />
        </div>
      ) : null}
    </FlowFrame>
  );
}

export interface TalkScreenProps {
  back: BackControl;
  notice?: ReactNode;
  focusOnArrival: boolean;
  onTranscript: (text: string) => void;
  onTypeInstead: () => void;
}

/** Talk: the real microphone, the shared recording rules and the transcription route. */
export function TalkScreen({ back, notice, focusOnArrival, onTranscript, onTypeInstead }: TalkScreenProps) {
  const { recorder, state } = useVoiceRecorder(onTranscript);
  const onMic = () => {
    if (state.phase === "recording" || state.phase === "paused") recorder.togglePause();
    else void recorder.start();
  };
  return (
    <TalkView
      state={state}
      back={back}
      notice={notice}
      focusOnArrival={focusOnArrival}
      onMic={onMic}
      onDone={recorder.finish}
      onStartAgain={() => void recorder.restart()}
      onTryAgain={() => (state.canResend ? recorder.resend() : void recorder.start())}
      onTypeInstead={onTypeInstead}
    />
  );
}
