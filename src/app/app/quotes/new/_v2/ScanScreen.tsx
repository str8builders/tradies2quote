"use client";

import type { ReactNode } from "react";
import { ScanPanel } from "../_components/ScanPanel";
import { notReadyHint, readyToWrite } from "./lib/channels";
import type { WritingStep } from "./lib/copy";
import { FlowFrame, ScreenHeading, WriteButton, writeActionHint, type BackControl } from "./parts";

export interface ScanScreenProps {
  scanned: string;
  onScanned: (text: string) => void;
  onWrite: () => void;
  writing: WritingStep;
  back: BackControl;
  notice?: ReactNode;
  focusOnArrival: boolean;
}

/**
 * Photo of a plan: the current plan reader (ScanPanel) unchanged inside the
 * new-look screen. Its words arrive once the tradie has checked the sizes;
 * then "Write my quote" goes. The heading's id labels ScanPanel's panel.
 */
export function ScanScreen({
  scanned,
  onScanned,
  onWrite,
  writing,
  back,
  notice,
  focusOnArrival,
}: ScanScreenProps) {
  const ready = readyToWrite("scan", scanned);
  return (
    <FlowFrame
      title="Photo of a plan"
      back={back}
      screenKey="scan"
      focusOnArrival={focusOnArrival}
      hint={writeActionHint(writing, ready ? undefined : notReadyHint("scan"))}
      actions={<WriteButton step={writing} ready={ready} onWrite={onWrite} />}
    >
      {notice}
      <ScreenHeading
        id="tab-scan"
        description="We'll count the materials from it. You'll check the sizes before anything is quoted."
      >
        Snap the drawing
      </ScreenHeading>
      <div inert={writing !== "idle"} data-testid="scan-panel-wrap">
        <ScanPanel transcript={scanned} setTranscript={onScanned} />
      </div>
    </FlowFrame>
  );
}
