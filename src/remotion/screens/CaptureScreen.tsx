/**
 * New quote, voice tab (`/app/quotes/new`: page.tsx + QuoteInputTabs.tsx).
 * States follow the app: idle → recording → transcribing → transcript review.
 */
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE } from "../demo-script";
import { C, FONT, TONE, rgba } from "../marketing/theme";
import { clock } from "../marketing/anim";
import { Accent, AppCanvas, Avatar, BottomNav, Card, MonoLabel, Page, PageIntro, PrimaryButton, Tap, TopScrim } from "./ui";
import { TapeGauge } from "./TapeGauge";
import { Waveform } from "./Waveform";

export type CaptureState = "idle" | "recording" | "transcribing" | "review";

export interface CaptureScreenProps {
  state: CaptureState;
  frame: number;
  /** 0..1 speech level while recording. */
  speaking?: number;
  /** Seconds shown on the recording timer. */
  elapsed?: number;
  /** 0..1 progress of the transcribing tape. */
  tape?: number;
  /** Transcript words revealed in the review block. */
  words?: number;
  scroll?: number;
  tap?: { x: number; y: number; p: number } | null;
  continuePress?: number;
  idleMotion?: number;
  /** Hide the bottom navigation (hero loop keeps the frame calm). */
  showNav?: boolean;
}

/** Words that the app highlights as numbers and sizes. */
const HIGHLIGHT = new Set(["24", "square", "metres"]);
const CHIP_BG = "rgba(255,95,21,0.2)";
const isSize = (word: string) => HIGHLIGHT.has(word.replace(/[.,]/g, ""));

function Tabs() {
  const t = TONE.quotes;
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: 5,
        borderRadius: 14,
        border: `1px solid ${rgba(t.rgb, 0.27)}`,
        background: "#182826",
      }}
    >
      {["Voice", "Type", "Scan"].map((label, i) => (
        <div
          key={label}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            fontSize: 12.5,
            fontWeight: 600,
            background: i === 0 ? C.brand : "transparent",
            color: i === 0 ? C.ink900 : "#c0d1ca",
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function TranscriptReview({ words }: { words: number }) {
  const all = EXAMPLE.transcript.split(" ");
  return (
    <div>
      <MonoLabel color="#ff9a62" size={9.5} style={{ letterSpacing: "0.16em" }}>
        {"// quick check — did I hear you right?"}
      </MonoLabel>
      <div style={{ marginTop: 8, fontSize: 19, fontWeight: 600, letterSpacing: "-0.03em" }}>Confirm before I quote</div>
      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: C.ink300 }}>
        Read it back. Numbers and sizes are highlighted — that&apos;s where misreads cause bad quotes.
      </div>
      <div
        style={{
          marginTop: 12,
          borderRadius: 4,
          border: `1px solid ${C.ink700}`,
          background: C.ink950,
          padding: "12px 14px",
          fontSize: 15.5,
          lineHeight: 1.62,
          color: C.ink100,
        }}
      >
        {all.map((word, i) => {
          const chip = isSize(word);
          const prevChip = i > 0 && isSize(all[i - 1]);
          const nextChip = i < all.length - 1 && isSize(all[i + 1]);
          const shown = i < words;
          const chipStyle = chip
            ? {
                background: CHIP_BG,
                fontWeight: 600,
                color: C.brand,
                paddingLeft: prevChip ? 0 : 3,
                paddingRight: nextChip ? 0 : 3,
                borderRadius: `${prevChip ? 0 : 2}px ${nextChip ? 0 : 2}px ${nextChip ? 0 : 2}px ${prevChip ? 0 : 2}px`,
              }
            : {};
          return (
            <span key={i}>
              <span style={{ opacity: shown ? 1 : 0, ...chipStyle }}>{word}</span>
              {i < all.length - 1 ? <span style={chip && nextChip && i + 1 < words ? { background: CHIP_BG } : undefined}> </span> : null}
            </span>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: FONT.mono,
          fontSize: 11,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: C.ink300,
        }}
      >
        <ArrowLeft size={12} weight="bold" /> Re-record
      </div>
    </div>
  );
}

export function CaptureScreen({
  state,
  frame,
  speaking = 0,
  elapsed = 0,
  tape = 0,
  words = 0,
  scroll = 0,
  tap = null,
  continuePress = 0,
  idleMotion = 1,
  showNav = true,
}: CaptureScreenProps) {
  const recording = state === "recording";
  const label = recording ? "Stop recording" : state === "transcribing" ? "Preparing your transcript" : "Start recording";
  const status = recording
    ? "Recording — tap again to stop."
    : state === "transcribing"
      ? "Transcribing…"
      : "Tap the waveform to start. Up to 3 minutes.";

  let panel: ReactNode;
  if (state === "review") {
    panel = <TranscriptReview words={words} />;
  } else {
    panel = (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff9a62" }}>
            Your site note
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, color: recording ? "#ffffff" : C.ink300, fontVariantNumeric: "tabular-nums" }}>
            {recording ? (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  marginRight: 8,
                  borderRadius: "50%",
                  background: C.brand,
                  verticalAlign: "2px",
                  opacity: 0.55 + 0.45 * Math.abs(Math.sin(frame / 9)),
                }}
              />
            ) : null}
            {clock(elapsed)}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 150,
            margin: "18px 0 6px",
          }}
        >
          {state === "transcribing" ? (
            <div style={{ height: 80, display: "grid", placeItems: "center" }}>
              <TapeGauge progress={tape} label="// transcribing" />
            </div>
          ) : (
            <div style={{ width: "100%", aspectRatio: "4 / 1" }}>
              <Waveform frame={frame} speaking={speaking} idleMotion={idleMotion} />
            </div>
          )}
          <div style={{ marginTop: 18, fontSize: 14, fontWeight: 600, color: "#ffc499" }}>{label}</div>
        </div>
        <div style={{ fontSize: 13.5, color: C.ink300, textAlign: "center" }}>{status}</div>
      </div>
    );
  }

  return (
    <>
      <AppCanvas />
      <Page scroll={scroll} top={112}>
        <PageIntro
          eyebrow="// step 1 of 3"
          title={
            <>
              Describe the <Accent>job.</Accent>
            </>
          }
          body="Talk it through, type it out, or scan a hand-drawn plan — either way we turn it into a quote."
        />
        <div style={{ marginTop: 14 }}>
          <Tabs />
        </div>
        <Card style={{ marginTop: 14, padding: "20px 20px 18px" }}>{panel}</Card>
        <div style={{ marginTop: 16 }}>
          <MonoLabel color={C.ink300} size={10.5}>
            {"// step 2: t2q builds the quote"}
          </MonoLabel>
          <PrimaryButton style={{ marginTop: 10, minHeight: 50, fontSize: 15 }} pressed={continuePress}>
            Continue <ArrowRight size={16} weight="bold" />
          </PrimaryButton>
        </div>
      </Page>
      <TopScrim />
      <Avatar />
      {showNav ? <BottomNav active="quotes" /> : null}
      {tap ? <Tap x={tap.x} y={tap.y} p={tap.p} /> : null}
    </>
  );
}
