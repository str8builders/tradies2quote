/**
 * The job's five steps in the app's new look, for the floating phone in the
 * job-site website's rooms (StepScreen). Each chapter turns its progress
 * (0–1, over the demo's 6-second beat) into screens, the same way ./story
 * does for the old look (which the homepage demo videos still use).
 *
 *   talk     Talk → listening → Done → "Did I hear you right?"
 *   draft    "Writing your quote…" → the job page, draft (26 hr × $60)
 *   check    "Change this line": 24 hr at $65, saved; the total holds at $4,830
 *   send     "Send to Sam" → by email → Sam's phone: read, sign, accept
 *   invoice  "Send invoice" → sent → "Mark as paid?" → "Paid. Nice work."
 *
 * The client's side (the quote link) didn't change with the new look, so
 * Send borrows its signing from ./story.
 */
import type { ReactNode } from "react";
import type { StepId } from "./step-screen";
import { eseg, seg } from "./anim";
import { storyShot } from "./story";
import { Tap } from "../screens/ui";
import { ReviewScreen, TalkScreen } from "../screens/newlook/TalkScreens";
import {
  GeneratingScreen,
  InvoiceSheet,
  JobScreen,
  LABOUR_DRAFT,
  LABOUR_FINAL,
  LineSheet,
  MarkPaidSheet,
  SendSheet,
} from "../screens/newlook/JobScreens";

export type NewLookShot = { a: ReactNode; b?: ReactNode; mix: number };

type TapAt = { x: number; y: number; p: number } | null;
const tapAt = (p: number, a: number, b: number, x: number, y: number): TapAt => (p > a && p < b ? { x, y, p: seg(p, a, b) } : null);
const pressAt = (p: number, a: number, b: number) => {
  const t = seg(p, a, b);
  return t > 0 && t < 1 ? Math.sin(Math.min(1, t / 0.6) * Math.PI) : 0;
};
const withTap = (screen: ReactNode, tap: TapAt): ReactNode => (
  <>
    {screen}
    {tap ? <Tap {...tap} /> : null}
  </>
);

/** The bottom bar's primary button (the one-button bar and the bottom of a two-button bar). */
const MAIN_Y = 782;
/** "What's in the job": the labour row, on the job page scrolled by LINES_SCROLL. */
const LINES_SCROLL = 260;
const LABOUR_ROW_Y = 507 - LINES_SCROLL;

function talk(p: number, t: number): NewLookShot {
  const recording = p >= 0.11 && p < 0.64;
  const phase = p < 0.11 ? "idle" : recording ? "recording" : "writing";
  const seconds = seg(p, 0.11, 0.62) * 38;
  const speaking = recording ? 0.75 + 0.25 * Math.sin(t * 1.7) : 0;
  const tap = tapAt(p, 0.05, 0.11, 195, MAIN_Y) ?? tapAt(p, 0.58, 0.64, 195, MAIN_Y);
  const press = pressAt(p, 0.05, 0.11) || pressAt(p, 0.58, 0.64);
  return {
    a: withTap(<TalkScreen phase={phase} t={t} seconds={seconds} speaking={speaking} press={press} />, tap),
    b: <ReviewScreen shown={Math.round(seg(p, 0.8, 0.94) * 160)} />,
    mix: eseg(p, 0.72, 0.8),
  };
}

function draft(p: number, t: number): NewLookShot {
  const elapsed = 8 + Math.floor(seg(p, 0, 0.36) * 4);
  return {
    a: <GeneratingScreen t={t} elapsed={elapsed} done={p >= 0.36} />,
    b: <JobScreen stage="draft" labour={LABOUR_DRAFT} scroll={eseg(p, 0.66, 0.8) * LINES_SCROLL} />,
    mix: eseg(p, 0.46, 0.54),
  };
}

function check(p: number): NewLookShot {
  const sheet = Math.min(eseg(p, 0.16, 0.24), 1 - eseg(p, 0.68, 0.76));
  const saved = p >= 0.68;
  const qty = p < 0.34 ? "26" : p < 0.38 ? "2" : "24";
  const price = p < 0.5 ? "60.00" : p < 0.54 ? "6" : p < 0.56 ? "65" : "65.00";
  const focus = p >= 0.28 && p < 0.44 ? "qty" : p >= 0.44 && p < 0.62 ? "price" : null;
  const tap =
    tapAt(p, 0.08, 0.16, 180, LABOUR_ROW_Y) ??
    tapAt(p, 0.28, 0.34, 103, 445) ??
    tapAt(p, 0.44, 0.5, 195, 535) ??
    tapAt(p, 0.62, 0.68, 195, MAIN_Y);
  const flash = p > 0.76 && p < 0.92 ? Math.sin(seg(p, 0.76, 0.92) * Math.PI) : 0;
  const labour = saved ? { ...LABOUR_FINAL, flash } : LABOUR_DRAFT;
  return {
    a: withTap(
      <>
        <JobScreen stage="draft" labour={labour} scroll={LINES_SCROLL} labourHighlight={pressAt(p, 0.08, 0.16) * 0.8} />
        {sheet > 0 ? <LineSheet enter={sheet} qty={qty} price={price} focus={focus} press={pressAt(p, 0.62, 0.68)} /> : null}
      </>,
      tap,
    ),
    mix: 0,
  };
}

function send(p: number, frame: number): NewLookShot {
  const sheet = Math.min(eseg(p, 0.1, 0.16), 1 - eseg(p, 0.4, 0.46));
  const sent = p >= 0.28;
  const tap = tapAt(p, 0.04, 0.1, 195, MAIN_Y) ?? tapAt(p, 0.2, 0.26, 195, MAIN_Y);
  const tradie = withTap(
    <>
      <JobScreen stage={p >= 0.3 ? "sent" : "draft"} pressMain={pressAt(p, 0.04, 0.1)} />
      {sheet > 0 ? <SendSheet enter={sent ? 1 : sheet} sent={sent} press={pressAt(p, 0.2, 0.26)} /> : null}
    </>,
    tap,
  );
  // Sam's phone: the quote link as it always looked, read, signed and accepted.
  const old = storyShot("send", { p: 0.34 + seg(p, 0.46, 1) * 0.66, frame, pace: "full" });
  const client = old ? (old.b && old.mix >= 0.5 ? old.b.screen : old.a.screen) : null;
  return { a: tradie, b: client, mix: eseg(p, 0.38, 0.46) };
}

function invoice(p: number): NewLookShot {
  const stage = p < 0.4 ? "done" : p < 0.8 ? "invoiced" : "paid";
  const invoiceSheet = Math.min(eseg(p, 0.14, 0.22), 1 - eseg(p, 0.36, 0.42));
  const paidSheet = Math.min(eseg(p, 0.56, 0.62), 1 - eseg(p, 0.76, 0.82));
  const tap =
    tapAt(p, 0.08, 0.14, 195, MAIN_Y) ??
    tapAt(p, 0.28, 0.34, 195, MAIN_Y) ??
    tapAt(p, 0.5, 0.56, 195, MAIN_Y) ??
    tapAt(p, 0.68, 0.74, 195, MAIN_Y);
  return {
    a: withTap(
      <>
        <JobScreen stage={stage} pressMain={pressAt(p, 0.08, 0.14) || pressAt(p, 0.5, 0.56)} />
        {invoiceSheet > 0 ? <InvoiceSheet enter={invoiceSheet} press={pressAt(p, 0.28, 0.34)} /> : null}
        {paidSheet > 0 ? <MarkPaidSheet enter={paidSheet} press={pressAt(p, 0.68, 0.74)} /> : null}
      </>,
      tap,
    ),
    mix: 0,
  };
}

export function newLookShot(step: StepId, { p, frame }: { p: number; frame: number }): NewLookShot {
  const t = frame / 30;
  switch (step) {
    case "talk":
      return talk(p, t);
    case "draft":
      return draft(p, t);
    case "check":
      return check(p);
    case "send":
      return send(p, frame);
    case "invoice":
      return invoice(p);
  }
}
