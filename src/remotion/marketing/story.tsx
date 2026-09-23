/**
 * Chapter choreography: turns a chapter's progress (0..1) into what each
 * phone shows. Layouts (wide, tall) decide where the phones sit; this module
 * decides what happens on them, so every composition tells the same story.
 * Timings live in ./beats (pure, unit-tested).
 *
 * Positions are screen px on the 390 px wide phone (see Phone.tsx). `focus`
 * is the screen y the layout should keep in view when it can only show part
 * of the phone (the tall layouts pan the phone like a camera).
 */
import type { ReactNode } from "react";
import { EXAMPLE, type SceneId } from "../demo-script";
import { easeInOut, eseg, seg, wordsShown } from "./anim";
import {
  CALC_BEATS,
  REQUEST_BEATS,
  checkBeats,
  draftBeats,
  invoiceBeats,
  labourLineAt,
  sendBeats,
  talkBeats,
  type Pace,
  type Span,
} from "./beats";
import { Push } from "./Push";
import { CaptureScreen, type CaptureState } from "../screens/CaptureScreen";
import { GeneratingScreen, QuoteReviewScreen, type LineView } from "../screens/QuoteReviewScreen";
import { ClientQuoteScreen } from "../screens/ClientQuoteScreen";
import { InvoiceQuoteScreen, InvoicesListScreen, type InvoiceStage } from "../screens/InvoiceScreens";
import { RequestFormScreen, RequestsScreen } from "../screens/RequestScreens";
import { CalculatorScreen, SendToQuoteSheet } from "../screens/CalculatorScreen";
import { PushBanner } from "../screens/SystemUI";

export type { Pace } from "./beats";
export type Finish = "graphite" | "silver";

export interface DeviceShot {
  finish: Finish;
  /** Which app page is showing; a change between chapters is animated as a push. */
  page: string;
  screen: ReactNode;
  focus: number;
}

export interface StoryShot {
  a: DeviceShot;
  /** Second device, swapped in as `mix` goes 0 -> 1. */
  b?: DeviceShot;
  mix: number;
}

export interface ShotArgs {
  p: number;
  frame: number;
  pace: Pace;
}

type Tap = { x: number; y: number; p: number } | null;

/** Piecewise eased keyframes: [[progress, value], ...]. */
export function kf(p: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (p <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [p1, v1] = points[i];
    const [p0, v0] = points[i - 1];
    if (p <= p1) return v0 + (v1 - v0) * easeInOut(seg(p, p0, p1));
  }
  return points[points.length - 1][1];
}

/** A finger tap at (x, y) between progress a and b, or null outside it. */
function tap(p: number, [a, b]: Span, x: number, y: number): Tap {
  return p > a && p < b ? { x, y, p: seg(p, a, b) } : null;
}

/** Press depth for a button tapped during [a, b]. */
function press(p: number, [a, b]: Span) {
  const t = seg(p, a, b);
  return t > 0 && t < 1 ? Math.sin(Math.min(1, t / 0.6) * Math.PI) : 0;
}

const [DECK, LABOUR] = EXAMPLE.lines;

/** The decking line as every chapter shows it (never edited). */
function deckingLine(extra: Partial<LineView> = {}): LineView {
  return { enter: 1, quantity: DECK.quantity, unitPrice: DECK.unitPrice, badge: "library", ...extra };
}
/** The labour line after review: 24 hr × $65.00. */
function finalLabour(extra: Partial<LineView> = {}): LineView {
  return { enter: 1, quantity: LABOUR.quantity, unitPrice: LABOUR.unitPrice, ...extra };
}
/** The labour line as the AI drafted it: 26 hr × $60.00. */
function draftLabour(extra: Partial<LineView> = {}): LineView {
  return { enter: 1, quantity: EXAMPLE.draftLabour.quantity, unitPrice: EXAMPLE.draftLabour.unitPrice, ...extra };
}

/* ─── Review page geometry (screen px, unscrolled) ───────────────────────── */

/** Scroll that brings the Materials and Labour sections to the top. */
export const SECTIONS_SCROLL = 420;
/** Scroll that brings the quote total card to the top. */
export const TOTAL_SCROLL = 180;
const LABOUR_FIELDS_Y = 634;
const QTY_X = 94;
const PRICE_X = 296;
const SAVE = { x: 72, y: 711 } as const;
const EMAIL = { x: 195, y: 711 } as const;

/* ─── Talk the job ───────────────────────────────────────────────────────── */

function talkShot({ p, frame, pace }: ShotArgs): StoryShot {
  const T = talkBeats(pace);
  const state: CaptureState = p < T.rec[0] ? "idle" : p < T.tr[0] ? "recording" : p < T.words[0] ? "transcribing" : "review";
  const speaking = eseg(p, T.rec[0], T.rec[0] + 0.04) * (1 - eseg(p, T.rec[1] - 0.04, T.rec[1]));
  const scroll = state === "review" ? kf(p, [[T.words[0], 0], [T.words[0] + 0.08, 92]]) : 0;
  const t = tap(p, T.tap, 195, 470) ?? tap(p, T.stop, 195, 470) ?? tap(p, T.cont, 195, 712 - scroll);
  return {
    mix: 0,
    a: {
      finish: "graphite",
      page: "capture",
      focus: kf(p, [[0, 425], [T.words[0], 425], [T.words[0] + 0.1, 470]]),
      screen: (
        <CaptureScreen
          state={state}
          frame={frame}
          speaking={speaking}
          elapsed={seg(p, T.rec[0], T.rec[1]) * 38}
          tape={seg(p, T.tr[0], T.words[0])}
          words={wordsShown(EXAMPLE.transcript, seg(p, T.words[0] + 0.01, T.words[1]))}
          scroll={scroll}
          tap={t}
          continuePress={press(p, T.cont)}
        />
      ),
    },
  };
}

/* ─── Draft builds itself ────────────────────────────────────────────────── */

function generating(g: number) {
  return <GeneratingScreen progress={eseg(g, 0, 0.82)} complete={g > 0.82} elapsed={`0:0${1 + Math.min(8, Math.floor(g * 8))}`} />;
}

function draftShot({ p, pace }: ShotArgs): StoryShot {
  const T = draftBeats(pace);
  const count = eseg(p, T.count[0], T.count[1]);
  const review = (
    <QuoteReviewScreen
      scroll={kf(p, [[T.gen, SECTIONS_SCROLL], [T.up[0], SECTIONS_SCROLL], [T.up[1], TOTAL_SCROLL]])}
      total={EXAMPLE.total * count}
      breakdown={{
        open: eseg(p, T.open[0], T.open[1]),
        materials: EXAMPLE.materialsSubtotal * count,
        markup: 0,
        labour: EXAMPLE.labourSubtotal * count,
        subtotal: EXAMPLE.subtotal * count,
        gst: EXAMPLE.gst * count,
      }}
      decking={deckingLine({ enter: eseg(p, T.deck[0], T.deck[1]) })}
      labour={draftLabour({ enter: eseg(p, T.labour[0], T.labour[1]) })}
    />
  );
  const push = seg(p, T.gen, T.gen + 0.06);
  return {
    mix: 0,
    a: {
      finish: "graphite",
      page: "generating",
      focus: kf(p, [[0, 400], [T.gen, 400], [T.gen + 0.06, 330], [T.labour[0], 330], [T.labour[1], 440], [T.up[0], 440], [T.up[1], 330]]),
      screen: push <= 0 ? generating(seg(p, 0, T.gen)) : push >= 1 ? review : <Push p={push} from={generating(1)} to={review} />,
    },
  };
}

/* ─── Check every line ───────────────────────────────────────────────────── */

function checkShot({ p, pace }: ShotArgs): StoryShot {
  const T = checkBeats(pace);
  const line = labourLineAt(p, pace);
  const labour: LineView = {
    enter: 1,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    editing: line.editing,
    flash: line.flash,
    checked: eseg(p, T.labourTick[0], T.labourTick[1]),
  };
  const save = T.save;
  const t = tap(p, T.qtyTap, QTY_X, LABOUR_FIELDS_Y) ?? tap(p, T.priceTap, PRICE_X, LABOUR_FIELDS_Y) ?? (save ? tap(p, save, SAVE.x, SAVE.y) : null);
  // Continue from where "Draft builds itself" left the page: total card open at the top.
  const settle = pace === "fast" ? 0.06 : 0.07;
  return {
    mix: 0,
    a: {
      finish: "graphite",
      page: "review",
      focus:
        pace === "fast"
          ? kf(p, [[0, 330], [settle, 520]])
          : kf(p, [[0, 330], [T.toLabour[0], 330], [T.toLabour[1], 520], [save ? save[0] - 0.04 : 1, 520], [1, save ? 560 : 520]]),
      screen: (
        <QuoteReviewScreen
          scroll={kf(p, [[0, TOTAL_SCROLL], [settle, SECTIONS_SCROLL]])}
          breakdown={{ open: 1 - eseg(p, 0, settle), materials: EXAMPLE.materialsSubtotal, markup: 0, labour: EXAMPLE.labourSubtotal, subtotal: EXAMPLE.subtotal, gst: EXAMPLE.gst }}
          total={EXAMPLE.total}
          decking={deckingLine({ checked: eseg(p, T.deckTick[0], T.deckTick[1]) })}
          labour={labour}
          sticky={{ saved: save ? p > save[0] + 0.05 : false }}
          tap={t}
        />
      ),
    },
  };
}

/* ─── Send and get the yes ───────────────────────────────────────────────── */

/** Scroll positions on the client's quote page. */
const CLIENT_TOTALS_SCROLL = 560;
const CLIENT_FORM_SCROLL = 850;

function clientQuote(p: number, T: ReturnType<typeof sendBeats>): DeviceShot {
  const accepted = p >= T.accepted;
  const formIn = p >= T.toForm[1] - 0.02;
  const scroll = accepted
    ? 0
    : kf(p, [
        [T.read[0], 0],
        [T.read[1], CLIENT_TOTALS_SCROLL],
        [T.toForm[1], CLIENT_FORM_SCROLL],
      ]);
  const checkboxY = 70 + 1334 - scroll;
  const buttonY = 70 + 1405 - scroll;
  const t = accepted ? null : (tap(p, T.tick, 45, checkboxY) ?? tap(p, T.press, 195, buttonY));
  return {
    finish: "silver",
    page: accepted ? "client-accepted" : "client-quote",
    focus: accepted ? 260 : kf(p, [[T.read[0], 380], [T.read[1], 420], [T.toForm[1], 500]]),
    screen: (
      <ClientQuoteScreen
        scroll={scroll}
        accepted={accepted}
        form={{
          name: formIn ? EXAMPLE.client : "",
          email: formIn ? EXAMPLE.clientEmail : "",
          signature: seg(p, T.sign[0], T.sign[1]),
          checked: p >= T.tick[1] - 0.02,
          press: press(p, T.press),
        }}
        tap={t}
      />
    ),
  };
}

function sendShot({ p, pace }: ShotArgs): StoryShot {
  const T = sendBeats(pace);
  const client = clientQuote(p, T);
  if (!T.email || !T.swap) return { mix: 0, a: client };
  const sent = p > T.email[0] + 0.05;
  return {
    mix: eseg(p, T.swap[0], T.swap[1]),
    a: {
      finish: "graphite",
      page: "review",
      focus: 560,
      screen: (
        <QuoteReviewScreen
          scroll={SECTIONS_SCROLL}
          status={sent ? "sent" : "draft"}
          total={EXAMPLE.total}
          decking={deckingLine({ checked: 1 })}
          labour={finalLabour({ checked: 1 })}
          sticky={{ saved: true, sent }}
          tap={tap(p, T.email, EMAIL.x, EMAIL.y)}
        />
      ),
    },
    b: client,
  };
}

/* ─── Invoice and get paid ───────────────────────────────────────────────── */

function invoiceShot({ p, pace }: ShotArgs): StoryShot {
  const T = invoiceBeats(pace);
  const stage: InvoiceStage = p < T.draft ? "ready" : p < T.paid ? "draft" : "paid";
  const listMix = seg(p, T.list[0], T.list[1]);
  const banner = T.banner ? Math.min(eseg(p, T.banner[0], T.banner[1]), 1 - eseg(p, T.banner[2], T.banner[3])) : 0;
  const t = (T.create ? tap(p, T.create, 195, 601) : null) ?? tap(p, T.paidTap, 276, 463);
  const quotePage = (
    <InvoiceQuoteScreen
      stage={stage}
      press={T.create && stage === "ready" ? press(p, T.create) : press(p, T.paidTap)}
      paidFlash={p >= T.paid ? Math.sin(seg(p, T.paid, T.paid + 0.12) * Math.PI) : 0}
      tap={listMix > 0 ? null : t}
    />
  );
  const tradie: DeviceShot = {
    finish: "graphite",
    page: "invoice",
    focus: T.banner
      ? kf(p, [[0, 300], [0.3, 300], [0.36, 520], [T.draft, 520], [T.draft + 0.06, 430], [T.list[0], 430], [T.list[1], 380]])
      : kf(p, [[0, 430], [T.list[0], 430], [T.list[1], 380]]),
    screen: (
      <>
        <Push p={listMix} from={quotePage} to={<InvoicesListScreen />} />
        <PushBanner title="Quote accepted" body={`${EXAMPLE.client} accepted ${EXAMPLE.quoteNumber}`} enter={banner} />
      </>
    ),
  };
  if (!T.swap) return { mix: 0, a: tradie };
  return {
    mix: eseg(p, T.swap[0], T.swap[1]),
    a: { finish: "silver", page: "client-accepted", focus: 260, screen: <ClientQuoteScreen accepted /> },
    b: tradie,
  };
}

/* ─── Request (FullTour) ─────────────────────────────────────────────────── */

function requestShot({ p }: ShotArgs): StoryShot {
  const T = REQUEST_BEATS;
  const sent = p >= T.sent;
  const client: DeviceShot = {
    finish: "silver",
    page: "request-form",
    focus: kf(p, [[0, 330], [T.email, 330], [T.send[0], 470], [T.sent + 0.02, 470], [T.sent + 0.08, 330]]),
    screen: (
      <RequestFormScreen
        state={{
          typed: Math.round(seg(p, T.type[0], T.type[1]) * EXAMPLE.request.length),
          name: p >= T.name,
          email: p >= T.email,
          press: press(p, T.send),
          sent,
        }}
        tap={sent ? null : tap(p, T.send, 195, 577)}
      />
    ),
  };
  const banner = Math.min(eseg(p, T.banner[0], T.banner[1]), 1 - eseg(p, T.banner[2], T.banner[3]));
  const tradie: DeviceShot = {
    finish: "graphite",
    page: "requests",
    focus: 420,
    screen: (
      <>
        <RequestsScreen arrive={eseg(p, T.arrive[0], T.arrive[1])} press={press(p, T.open)} tap={tap(p, T.open, 256, 469)} />
        <PushBanner title="New quote request" body={`${EXAMPLE.client}: new timber deck, about 24 m²`} enter={banner} />
      </>
    ),
  };
  return { mix: eseg(p, T.swap[0], T.swap[1]), a: client, b: tradie };
}

/* ─── Measured in T2QCAL (FullTour) ──────────────────────────────────────── */

function calculatorShot({ p }: ShotArgs): StoryShot {
  const T = CALC_BEATS;
  const toApp = seg(p, T.toApp[0], T.toApp[1]);
  const calc = (
    <CalculatorScreen reveal={eseg(p, T.draw[0], T.draw[1])} tap={tap(p, T.create, 195, 591)}>
      <SendToQuoteSheet enter={eseg(p, T.sheet[0], T.sheet[1])} press={press(p, T.create)} sent={p >= T.sent} />
    </CalculatorScreen>
  );
  const badge = seg(p, T.badge[0], T.badge[1]);
  const app = (
    <QuoteReviewScreen
      scroll={SECTIONS_SCROLL}
      total={EXAMPLE.total}
      decking={deckingLine({ badge: badge > 0.5 ? "calculated" : "library", flash: badge > 0 && badge < 1 ? Math.sin(badge * Math.PI) : 0 })}
      labour={draftLabour()}
    />
  );
  return {
    mix: 0,
    a: {
      finish: "graphite",
      page: "calculator",
      focus: kf(p, [[0, 330], [T.sheet[0], 330], [T.sheet[1], 470], [T.toApp[0], 470], [T.toApp[1], 330]]),
      screen: <Push p={toApp} from={calc} to={app} />,
    },
  };
}

/* ─── Dispatch ───────────────────────────────────────────────────────────── */

export function storyShot(id: SceneId, args: ShotArgs): StoryShot | null {
  switch (id) {
    case "talk":
      return talkShot(args);
    case "draft":
      return draftShot(args);
    case "check":
      return checkShot(args);
    case "send":
      return sendShot(args);
    case "invoice":
      return invoiceShot(args);
    case "request":
      return requestShot(args);
    case "calculator":
      return calculatorShot(args);
    default:
      return null;
  }
}

/** Page each chapter ends on, when it differs from the page it starts on. */
const END_PAGE: Partial<Record<SceneId, string>> = { draft: "review", calculator: "review", invoice: "invoice-list" };

/** The device on screen at the end of a chapter (for chapter transitions). */
export function finalDevice(shot: StoryShot, id?: SceneId): DeviceShot {
  const device = shot.b && shot.mix >= 0.5 ? shot.b : shot.a;
  const page = id ? END_PAGE[id] : undefined;
  return page ? { ...device, page } : device;
}
