/**
 * Home's first-run tour (new look), as data: the stops, when it starts on
 * its own, and where its card goes beside what it points at. Pure; the
 * overlay itself is HomeTour.tsx.
 *
 * Each stop points at something already on Home, by the test ids the
 * screens already carry, so the tour can't drift from the real layout. A
 * stop whose target isn't on screen (no setup card once set up) is left out.
 */

import { QR_CODE_PATH } from "../lib/app-nav";

/** Set on this phone once the tour is finished or skipped. */
export const TOUR_SEEN_KEY = "t2q-home-tour-seen";
/** The old look's coachmark tour: someone who did that one isn't new. */
export const OLD_TOUR_DONE_KEY = "t2q-tour-done";
/** /app?tour=1 starts it again (the "Take the tour" menu row). */
export const TOUR_PARAM = "tour";
/** An account this young still counts as new, even with a job in. */
export const NEW_ACCOUNT_DAYS = 14;

export type TourStopId = "welcome" | "new" | "jobs" | "prices" | "timesheet" | "qr" | "photo" | "setup";

export interface TourStop {
  id: TourStopId;
  /** What it points at; null for the card in the middle of the screen. */
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_STOPS: readonly TourStop[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Tradies2Quote",
    body: "Here’s a quick look around, so you know where everything is. It takes about half a minute.",
  },
  {
    id: "new",
    target: '[data-testid="app-nav-new"]',
    title: "Start a quote here",
    body: "Tap New and say the job like you’d tell a mate, or type a few lines. The quote is written for you, and you check it before it goes anywhere.",
  },
  {
    id: "jobs",
    target: '[data-testid="app-nav-jobs"]',
    title: "Every job in one place",
    body: "Quotes, booked work and invoices, from draft to paid. Open one to send it, book it in or invoice it.",
  },
  {
    id: "prices",
    target: '[data-testid="app-nav-prices"]',
    title: "Your prices",
    body: "Save your materials and rates once and new quotes fill them in. Scan a barcode or a supplier quote to add them fast.",
  },
  {
    id: "timesheet",
    target: '[data-testid="app-nav-timesheet"]',
    title: "Log your hours",
    body: "Your hours and your crew’s, day by day. Put them straight on an invoice when the job’s done.",
  },
  {
    id: "qr",
    target: `[data-testid="home-quick"] a[href="${QR_CODE_PATH}"]`,
    title: "Your QR code",
    body: "Print it for the van. Anyone who scans it can tell you about their job, and it lands here as a draft quote.",
  },
  {
    id: "photo",
    target: '[data-testid="top-bar-account"]',
    title: "Settings are behind your photo",
    body: "Your business details, rates, payments and help. You can take this tour again from there too.",
  },
  {
    id: "setup",
    target: '[data-testid="setup-card"]',
    title: "Start here",
    body: "Three quick things and you’re ready to quote. Each one is a tap away.",
  },
];

/** The stops to show: the welcome, then every stop whose target is on screen. */
export function stopsOnScreen(isShown: (selector: string) => boolean, stops: readonly TourStop[] = TOUR_STOPS): TourStop[] {
  return stops.filter((stop) => stop.target === null || isShown(stop.target));
}

/**
 * Whether Home offers the tour on its own: a first-run account (no jobs yet,
 * or opened in the last two weeks), and only once the jobs actually loaded
 * (an empty board from a failed read isn't a new account).
 */
export function isFirstRun({
  hasJobs,
  failed,
  createdAt,
  now,
}: {
  hasJobs: boolean;
  failed: boolean;
  createdAt: string | null | undefined;
  now: Date;
}): boolean {
  if (failed) return false;
  if (!hasJobs) return true;
  const created = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(created)) return false;
  return now.getTime() - created <= NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

/** Starts on its own only for a first run not yet seen on this phone; ?tour=1 always starts it. */
export function shouldStartTour({
  firstRun,
  asked,
  seen,
}: {
  firstRun: boolean;
  asked: boolean;
  seen: boolean;
}): boolean {
  return asked || (firstRun && !seen);
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Placement = "below" | "above" | "right" | "left" | "center";

/** Room kept to the screen's edges, and between the card and what it points at. */
export const EDGE = 16;
export const GAP = 14;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where the card goes: below what it points at when there's room, else
 * above, else beside it, else wherever there's most room. Beside comes
 * first for the desktop rail (a target in the left quarter of a wide
 * screen). Always inside the screen, EDGE from each side.
 */
export function placeCard(
  target: Box | null,
  card: { width: number; height: number },
  screen: { width: number; height: number },
): { top: number; left: number; placement: Placement } {
  const centred = {
    top: clamp((screen.height - card.height) / 2, EDGE, screen.height - EDGE - card.height),
    left: clamp((screen.width - card.width) / 2, EDGE, screen.width - EDGE - card.width),
  };
  if (!target) return { ...centred, placement: "center" };

  const below = screen.height - (target.top + target.height) - GAP - EDGE;
  const above = target.top - GAP - EDGE;
  const right = screen.width - (target.left + target.width) - GAP - EDGE;
  const left = target.left - GAP - EDGE;
  const alongX = clamp(target.left + target.width / 2 - card.width / 2, EDGE, screen.width - EDGE - card.width);
  const alongY = clamp(target.top + target.height / 2 - card.height / 2, EDGE, screen.height - EDGE - card.height);

  const rail = screen.width >= 640 && target.left + target.width <= screen.width / 4;
  if (rail && right >= card.width) return { top: alongY, left: target.left + target.width + GAP, placement: "right" };
  if (below >= card.height) return { top: target.top + target.height + GAP, left: alongX, placement: "below" };
  if (above >= card.height) return { top: target.top - GAP - card.height, left: alongX, placement: "above" };
  if (right >= card.width) return { top: alongY, left: target.left + target.width + GAP, placement: "right" };
  if (left >= card.width) return { top: alongY, left: target.left - GAP - card.width, placement: "left" };
  return below >= above
    ? { top: clamp(target.top + target.height + GAP, EDGE, screen.height - EDGE - card.height), left: alongX, placement: "below" }
    : { top: clamp(target.top - GAP - card.height, EDGE, screen.height - EDGE - card.height), left: alongX, placement: "above" };
}
