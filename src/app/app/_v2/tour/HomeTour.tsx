"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { UI_TEXT } from "@/components/ui/styles";
import { SETTINGS_TIP_SEEN_EVENT, markSettingsTipSeen } from "../shell/SettingsTip";
import {
  EDGE,
  GAP,
  OLD_TOUR_DONE_KEY,
  TOUR_PARAM,
  TOUR_SEEN_KEY,
  placeCard,
  shouldStartTour,
  stopsOnScreen,
  type Box,
  type TourStop,
} from "./tour-steps";

/** The welcome after signing in (NewLookWelcome): the tour waits until it's gone. */
const WELCOME = '[data-testid="new-look-welcome"]';
/** Home's day has streamed in once the quick actions are there. */
const READY = '[data-testid="home-quick"]';
const POLL_MS = 250;
/** A beat after the welcome fades, so the tour doesn't land on top of it. */
const SETTLE_MS = 600;
/** Something stuck (a welcome that never closed): try again next visit. */
const GIVE_UP_MS = 30000;
/** Room around what the spotlight shows. */
const PAD = 6;

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1" || window.localStorage.getItem(OLD_TOUR_DONE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Drop ?tour=1 once the tour is over, so a refresh doesn't start it again.
 * Not before: a changed query remounts the page (and this with it), and the
 * new copy would no longer know it was asked for.
 */
function dropTourParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(TOUR_PARAM)) return;
  url.searchParams.delete(TOUR_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function writeSeen(): void {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // Blocked storage: it offers itself again next visit.
  }
}

/** The element's box and its children's (the raised New tile pokes out of its link). */
function boxOf(selector: string | null): Box | null {
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return null;
  const rects = [el, ...Array.from(el.children)].map((node) => node.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const right = Math.max(...rects.map((r) => r.right));
  return { top: top - PAD, left: left - PAD, width: right - left + PAD * 2, height: bottom - top + PAD * 2 };
}

const shown = (selector: string) => boxOf(selector) !== null;

function isFixed(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (window.getComputedStyle(node).position === "fixed") return true;
  }
  return false;
}

/**
 * Scroll so what the tour points at and its card both fit: the card above
 * the target when there's room for both over the tab bar, else the target
 * in the middle. Fixed things (the tab bar) are always in view.
 */
function bringIntoView(el: Element, cardHeight: number): void {
  if (isFixed(el)) return;
  const box = el.getBoundingClientRect();
  const bar = document.querySelector('[data-testid="app-nav"]')?.getBoundingClientRect();
  // The phone tab bar docks at the bottom; from sm up it's a rail down the side.
  const bottom = bar && bar.top > window.innerHeight / 2 ? bar.top : window.innerHeight;
  const both = EDGE + cardHeight + GAP + PAD + box.height + PAD + EDGE;
  const top = both <= bottom ? EDGE + cardHeight + GAP + PAD : Math.max(EDGE + PAD, (bottom - box.height) / 2);
  window.scrollBy({ top: box.top - top, behavior: "auto" });
}

export interface TourLayout {
  /** The spotlight's box, or null for the whole screen dimmed (the welcome). */
  hole: Box | null;
  top: number;
  left: number;
}

/**
 * The tour on screen (no state): the page dimmed except the spotlight, and
 * the card with where you are, what this is, and Skip, Back and Next.
 * Rendered in the browser's top layer by HomeTour, so it sits over the tab
 * bar and everything else; before it's placed the card is invisible.
 */
export function HomeTourView({
  stop,
  index,
  total,
  layout,
  onNext,
  onBack,
  onSkip,
}: {
  stop: TourStop;
  index: number;
  total: number;
  layout: TourLayout | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const last = index === total - 1;
  const hole = layout?.hole ?? null;
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="home-tour-spotlight"
        className={cx(
          "pointer-events-none absolute",
          hole
            ? "rounded-ui-lg shadow-[0_0_0_200vmax_var(--color-ui-scrim)] outline-2 outline-offset-2 outline-ui-brand"
            : "inset-0 bg-ui-scrim",
        )}
        style={hole ? { top: hole.top, left: hole.left, width: hole.width, height: hole.height } : undefined}
      />
      <div
        key={stop.id}
        data-tour-card=""
        className={cx(
          "absolute w-[min(22.5rem,calc(100vw-2rem))] rounded-ui-lg border border-ui-line bg-ui-surface p-4 shadow-ui-raised",
          "animate-ui-fade-in motion-reduce:animate-none",
          !layout && "invisible",
        )}
        style={{ top: layout?.top ?? 0, left: layout?.left ?? 0 }}
      >
        <p className="text-ui-sm text-ui-muted">
          {index + 1} of {total}
        </p>
        <h2 id="home-tour-title" className="ui-title mt-1 text-ui-lg text-ui-text">
          {stop.title}
        </h2>
        <p id="home-tour-body" className="mt-1 text-ui-base text-ui-muted">
          {stop.body}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onSkip} data-testid="home-tour-skip">
            {last ? "Close" : "Skip tour"}
          </Button>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button variant="secondary" onClick={onBack} data-testid="home-tour-back">
                Back
              </Button>
            ) : null}
            <Button variant="primary" size="md" onClick={onNext} data-tour-next="" data-testid="home-tour-next">
              {last ? "Let’s go" : index === 0 ? "Show me around" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Home's first-run tour (new look): a spotlight on each real part of the
 * app in turn (New, Jobs, Prices, Timesheet, your QR code, the photo menu,
 * the setup card), one card of plain words each. Replaces the old look's
 * coachmark tour for the new look.
 *
 * - Starts on its own for a first-run account (see isFirstRun) not yet seen
 *   on this phone, and always from /app?tour=1 ("Take the tour").
 * - Waits for the welcome animation to finish and Home to stream in, so the
 *   two never overlap; nothing of it is in the server HTML.
 * - Skip, Escape or finishing marks it seen on this phone. Getting past the
 *   photo stop also retires the settings tip, which it hides while it runs.
 * - A modal dialog: focus stays in the card, the page behind can't be
 *   tapped. With Reduce Motion the card appears without its fade.
 */
export function HomeTour({ firstRun }: { firstRun: boolean }) {
  const [stops, setStops] = useState<TourStop[] | null>(null);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<TourLayout | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stop = stops?.[index] ?? null;

  // Decide on arrival, then wait for the welcome to finish and the day to load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const asked = params.get(TOUR_PARAM) === "1";
    if (!shouldStartTour({ firstRun, asked, seen: readSeen() })) return;
    const started = Date.now();
    let settle = 0;
    const poll = window.setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) {
        window.clearInterval(poll);
        return;
      }
      if (document.querySelector(WELCOME) || !document.querySelector(READY)) return;
      window.clearInterval(poll);
      settle = window.setTimeout(() => {
        window.dispatchEvent(new Event(SETTINGS_TIP_SEEN_EVENT));
        setLayout(null);
        setIndex(0);
        setStops(stopsOnScreen(shown));
      }, SETTLE_MS);
    }, POLL_MS);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(settle);
    };
  }, [firstRun]);

  // Into the top layer while it runs.
  useEffect(() => {
    const el = dialog.current;
    if (!stops || !el) return;
    try {
      if (!el.open) el.showModal();
    } catch {
      // Still a fixed, open dialog over the page.
    }
  }, [stops]);

  // Bring what it points at into view, then place the spotlight and the card
  // (again on scroll and resize).
  useEffect(() => {
    if (!stop) return;
    let frame = 0;
    let first = true;
    const measure = () => {
      frame = 0;
      const card = dialog.current?.querySelector("[data-tour-card]")?.getBoundingClientRect();
      if (first) {
        // Once per stop, with the card's real height (it's rendered, hidden, by now).
        first = false;
        const el = stop.target ? document.querySelector(stop.target) : null;
        if (el) bringIntoView(el, card?.height ?? 220);
      }
      const hole = boxOf(stop.target);
      const at = placeCard(
        hole,
        { width: card?.width ?? 360, height: card?.height ?? 220 },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setLayout({ hole, top: at.top, left: at.left });
    };
    const again = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    again();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
    };
  }, [stop]);

  // Once the card is placed (it can't take focus while hidden), focus Next,
  // so Enter moves on.
  const placed = layout !== null;
  useEffect(() => {
    if (stop && placed) dialog.current?.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus();
  }, [stop, placed]);

  const end = useCallback(
    (finished: boolean) => {
      writeSeen();
      dropTourParam();
      if (finished || stops?.slice(0, index + 1).some((s) => s.id === "photo")) markSettingsTipSeen();
      setStops(null);
      setLayout(null);
    },
    [stops, index],
  );

  if (!stops || !stop) return null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="home-tour-title"
      aria-describedby="home-tour-body"
      data-testid="home-tour"
      data-stop={stop.id}
      onCancel={(event) => {
        // Escape: skip, and keep React in charge of when it closes.
        event.preventDefault();
        end(false);
      }}
      className={cx(
        "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 outline-none backdrop:bg-transparent",
        UI_TEXT,
      )}
    >
      <HomeTourView
        stop={stop}
        index={index}
        total={stops.length}
        layout={layout}
        onNext={() => {
          if (index === stops.length - 1) return end(true);
          setLayout(null);
          setIndex(index + 1);
        }}
        onBack={() => {
          setLayout(null);
          setIndex(Math.max(0, index - 1));
        }}
        onSkip={() => end(false)}
      />
    </dialog>
  );
}
