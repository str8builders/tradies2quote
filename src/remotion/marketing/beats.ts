/**
 * Chapter timings as fractions of each chapter (so the same story plays at
 * 6-8 s per chapter in the demos and at ~2 s in the social cut), plus the
 * labour-line edit state. Pure: no React or Remotion, so unit tests can walk
 * every frame of every step.
 */
import { LABOUR_EDIT_STEPS, lineTotal } from "../demo-script";

export type Pace = "full" | "fast";
export type Span = readonly [number, number];

/** Linear 0..1 progress of `t` between `a` and `b`, clamped. */
function seg(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

export function talkBeats(pace: Pace) {
  return pace === "fast"
    ? ({ tap: [0.0, 0.08], rec: [0.04, 0.38], stop: [0.34, 0.42], tr: [0.4, 0.46], words: [0.47, 0.84], cont: [0.88, 0.99] } as const)
    : ({ tap: [0.04, 0.12], rec: [0.08, 0.43], stop: [0.39, 0.47], tr: [0.43, 0.51], words: [0.52, 0.85], cont: [0.9, 0.99] } as const);
}

/**
 * Totals count up once, land exactly on the final figures and then hold for
 * at least 1.5 s before the chapter ends (full: 50 of 180 frames, fast: 45 of
 * 72), so no chapter cut, poster or still shows a half-counted number.
 */
export function draftBeats(pace: Pace) {
  return pace === "fast"
    ? ({ gen: 0.08, deck: [0.09, 0.18], labour: [0.16, 0.25], up: [0.25, 0.33], open: [0.27, 0.35], count: [0.27, 0.37] } as const)
    : ({ gen: 0.22, deck: [0.27, 0.37], labour: [0.37, 0.47], up: [0.52, 0.6], open: [0.57, 0.66], count: [0.59, 0.72] } as const);
}

/**
 * "Check every line": the tradie ticks the decking line, corrects the hours
 * (26 → 24), then the rate ($60 → $65). A field shows its old value selected,
 * then the new value, which is committed in the same frame.
 */
export function checkBeats(pace: Pace) {
  return pace === "fast"
    ? ({
        deckTick: [0.0, 0.1],
        toLabour: [0, 0.01],
        qtyTap: [0.04, 0.12],
        qtySel: [0.1, 0.18],
        qtyBlur: 0.22,
        priceTap: [0.24, 0.32],
        priceSel: [0.3, 0.38],
        priceBlur: 0.42,
        labourTick: [0.44, 0.56],
        save: null,
      } as const)
    : ({
        deckTick: [0.06, 0.15],
        toLabour: [0.15, 0.24],
        qtyTap: [0.24, 0.32],
        qtySel: [0.3, 0.36],
        qtyBlur: 0.41,
        priceTap: [0.43, 0.51],
        priceSel: [0.49, 0.55],
        priceBlur: 0.6,
        labourTick: [0.62, 0.71],
        save: [0.76, 0.84],
      } as const);
}

export function sendBeats(pace: Pace) {
  return pace === "fast"
    ? ({ email: null, swap: null, read: [0.0, 0.24], toForm: [0.24, 0.32], sign: [0.32, 0.6], tick: [0.6, 0.68], press: [0.68, 0.76], accepted: 0.76 } as const)
    : ({ email: [0.03, 0.11], swap: [0.16, 0.25], read: [0.26, 0.5], toForm: [0.5, 0.56], sign: [0.56, 0.78], tick: [0.78, 0.84], press: [0.84, 0.91], accepted: 0.91 } as const);
}

export function invoiceBeats(pace: Pace) {
  return pace === "fast"
    ? ({ swap: null, banner: null, create: null, draft: 0, paidTap: [0.12, 0.26], paid: 0.24, list: [0.58, 0.66] } as const)
    : ({ swap: [0.02, 0.12], banner: [0.1, 0.18, 0.27, 0.33], create: [0.34, 0.42], draft: 0.41, paidTap: [0.52, 0.6], paid: 0.59, list: [0.74, 0.82] } as const);
}

export const REQUEST_BEATS = {
  type: [0.04, 0.3],
  name: 0.32,
  email: 0.35,
  send: [0.38, 0.45],
  sent: 0.44,
  swap: [0.53, 0.63],
  banner: [0.6, 0.68, 0.8, 0.86],
  arrive: [0.64, 0.74],
  open: [0.88, 0.96],
} as const;

export const CALC_BEATS = { draw: [0.02, 0.26], sheet: [0.3, 0.4], create: [0.5, 0.58], sent: 0.56, toApp: [0.63, 0.7], badge: [0.72, 0.82] } as const;

/**
 * HeroLoop, in frames of its 270-frame loop. Static holds at both ends make
 * the last frame identical to the first; the total lands on $4,830.00 at
 * `count[1]` and holds until `back[0]` (1.9 s) before the loop returns.
 */
export const HERO_BEATS = {
  tap: [14, 24],
  rec: [20, 80],
  stop: [76, 86],
  words: [88, 128],
  toDraft: [134, 146],
  deck: [146, 160],
  labour: [156, 170],
  up: [170, 182],
  count: [176, 194],
  ready: [190, 202],
  back: [250, 262],
} as const;

/* ─── Labour line through "Check every line" ─────────────────────────────── */

export type EditField = "qty" | "price";

export interface LabourLineState {
  step: (typeof LABOUR_EDIT_STEPS)[number]["step"];
  quantity: number;
  unitPrice: number;
  /** Always quantity × unit price. */
  total: number;
  /** The field being edited and exactly what it shows. */
  editing: { field: EditField; text: string; selected: boolean } | null;
  /** 0..1 highlight on the line total just after a change is committed. */
  flash: number;
}

/** How the app's number inputs show a value: plain, no forced decimals. */
export function fieldText(value: number): string {
  return String(value);
}

function flashAfter(p: number, at: number): number {
  const t = seg(p, at, at + 0.09);
  return t > 0 && t < 1 ? Math.sin(t * Math.PI) : 0;
}

export function labourLineAt(p: number, pace: Pace): LabourLineState {
  const T = checkBeats(pace);
  const [draft, hours, rate] = LABOUR_EDIT_STEPS;
  const qtyCommit = T.qtySel[1];
  const priceCommit = T.priceSel[1];
  const current = p >= priceCommit ? rate : p >= qtyCommit ? hours : draft;
  let editing: LabourLineState["editing"] = null;
  if (p >= T.qtySel[0] && p < T.qtyBlur) {
    editing = { field: "qty", text: fieldText(current.quantity), selected: p < qtyCommit };
  } else if (p >= T.priceSel[0] && p < T.priceBlur) {
    editing = { field: "price", text: fieldText(current.unitPrice), selected: p < priceCommit };
  }
  return {
    step: current.step,
    quantity: current.quantity,
    unitPrice: current.unitPrice,
    total: lineTotal(current.quantity, current.unitPrice),
    editing,
    flash: Math.max(flashAfter(p, qtyCommit), flashAfter(p, priceCommit)),
  };
}
