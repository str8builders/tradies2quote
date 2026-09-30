"use client";

// ─────────────────────────────────────────────────────────────────────────
// Scoped body scroll-lock for modal sheets (mobile/iOS).
//
// CONTRACT NOTE (docs/mobile-shell-contract.md): the document stays the
// app's single scroll owner. This lock is NOT the banned general shell
// scroll-lock — it is applied via inline styles ONLY while a sheet/modal
// is open and fully reverted on close, restoring the exact scroll
// position. `overflow: hidden` alone does not stop iOS Safari touch
// scrolling, so the robust pattern is `position: fixed` on <body> with a
// negative top offset (freezes the page exactly where it was), then an
// instant scroll restore on release.
//
// KEYBOARD (iPhone). While the keyboard is up the phone shrinks and slides
// the viewport. Putting the page back in that state (a sheet saved and
// closed with the keyboard still showing) can leave the phone drawing the
// page lower than it thinks it is: the bottom action bar then floats above
// the bottom edge, over the last button, and the top bar slides under the
// clock. So a release with the keyboard up puts the keyboard away first and
// puts the page back once the viewport is whole again.
//
// The pure core (applyBodyScrollLock) takes doc/win handles so it is
// unit-testable in node without jsdom; the hook is a thin React wrapper.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef } from "react";

type BodyStyleSlice = {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
};

export interface LockableDocument {
  body: { style: BodyStyleSlice };
  documentElement: { style: { scrollBehavior: string } };
  /** Whatever has the focus (it holds the keyboard up). */
  activeElement?: { blur?: () => void } | null;
}

/** The part of window.visualViewport the lock reads. */
export interface LockableViewport {
  height: number;
  offsetTop: number;
  scale?: number;
  addEventListener: (type: "resize", listener: () => void) => void;
  removeEventListener: (type: "resize", listener: () => void) => void;
}

export interface LockableWindow {
  scrollY: number;
  scrollTo: (x: number, y: number) => void;
  innerHeight?: number;
  visualViewport?: LockableViewport | null;
  setTimeout?: (handler: () => void, ms: number) => unknown;
  clearTimeout?: (id: never) => void;
  location?: { href: string };
}

/** Release the lock. `immediate` skips the wait for the keyboard (a link about to navigate). */
export type ReleaseScrollLock = (immediate?: boolean) => void;

/** Anything shorter isn't a keyboard (an iPhone's is 250 px and up). */
const KEYBOARD_MIN_PX = 120;
/** The longest the page stays frozen waiting for the keyboard to go. */
export const KEYBOARD_WAIT_MS = 700;
/** After the page is back: long enough for the phone to report where it's drawing it. */
const SETTLE_CHECK_MS = 350;

/** A release still waiting for the keyboard; a new lock finishes it first. */
let pendingRestore: (() => void) | null = null;

function keyboard(win: LockableWindow): { showing: boolean; panned: boolean } {
  const vv = win.visualViewport;
  if (!vv || typeof win.innerHeight !== "number") return { showing: false, panned: false };
  // Pinch-zoomed: a small viewport that isn't a keyboard.
  if (typeof vv.scale === "number" && Math.abs(vv.scale - 1) > 0.01) return { showing: false, panned: false };
  return { showing: win.innerHeight - vv.height > KEYBOARD_MIN_PX, panned: vv.offsetTop > 1 };
}

/**
 * Freeze the document scroll in place. Returns a release function that
 * reverts every style it set and restores the original scroll position
 * (instantly — html's `scroll-behavior: smooth` is suspended for the
 * restore so closing a sheet never animates the page). With the keyboard
 * up, the release waits for it to go (see KEYBOARD above).
 */
export function applyBodyScrollLock(
  doc: LockableDocument,
  win: LockableWindow,
): ReleaseScrollLock {
  // One sheet closing into another: finish the first one's release now, so
  // this lock starts from the real page and can never restore a frozen one.
  pendingRestore?.();

  const scrollY = win.scrollY;
  const href = win.location?.href;
  const body = doc.body.style;
  const prev: BodyStyleSlice = {
    position: body.position,
    top: body.top,
    left: body.left,
    right: body.right,
    width: body.width,
  };

  body.position = "fixed";
  body.top = `-${scrollY}px`;
  body.left = "0";
  body.right = "0";
  body.width = "100%";

  const instantly = (scroll: () => void) => {
    // html carries `scroll-behavior: smooth`, which would otherwise animate
    // the jump back to the saved position.
    const html = doc.documentElement.style;
    const prevBehavior = html.scrollBehavior;
    html.scrollBehavior = "auto";
    scroll();
    html.scrollBehavior = prevBehavior;
  };

  let released = false;
  let restored = false;
  let stopWaiting: (() => void) | null = null;

  const restore = () => {
    if (restored) return;
    restored = true;
    if (pendingRestore === restore) pendingRestore = null;
    stopWaiting?.();
    body.position = prev.position;
    body.top = prev.top;
    body.left = prev.left;
    body.right = prev.right;
    body.width = prev.width;
    // A page opened while this waited keeps its own scroll position.
    if (href === win.location?.href) instantly(() => win.scrollTo(0, scrollY));
  };

  return (immediate = false) => {
    if (released) return; // idempotent — double-release must be harmless
    released = true;
    const vv = win.visualViewport;
    const state = keyboard(win);
    if (immediate || !vv || !win.setTimeout || (!state.showing && !state.panned)) {
      restore();
      return;
    }

    // The keyboard is up: put it away, and put the page back when it's gone.
    doc.activeElement?.blur?.();
    const onResize = () => {
      const now = keyboard(win);
      if (!now.showing && !now.panned) finish();
    };
    const finish = () => {
      restore();
      // Belt and braces: if the phone still draws the page lower than it
      // thinks (viewport offset with no keyboard), one 1 px scroll there and
      // back makes it line the two up again.
      win.setTimeout?.(() => {
        const after = keyboard(win);
        if (!after.panned || after.showing) return;
        const y = win.scrollY;
        instantly(() => {
          win.scrollTo(0, y > 0 ? y - 1 : 1);
          win.scrollTo(0, y);
        });
      }, SETTLE_CHECK_MS);
    };
    vv.addEventListener("resize", onResize);
    const timer = win.setTimeout(finish, KEYBOARD_WAIT_MS);
    stopWaiting = () => {
      vv.removeEventListener("resize", onResize);
      win.clearTimeout?.(timer as never);
    };
    pendingRestore = restore;
  };
}

/**
 * Lock the document scroll while `active` is true (e.g. a bottom sheet is
 * open). Reverts and restores the scroll position when `active` flips
 * false or the component unmounts.
 */
export function useBodyScrollLock(active: boolean): () => void {
  const releaseRef = useRef<ReleaseScrollLock | null>(null);
  // Links release synchronously, before Next scrolls to the destination hash.
  // The later effect cleanup must not restore the old page over that position.
  const releaseNow = useCallback(() => {
    releaseRef.current?.(true);
    releaseRef.current = null;
  }, []);
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const release = applyBodyScrollLock(
      document as unknown as LockableDocument,
      window as unknown as LockableWindow,
    );
    releaseRef.current = release;
    return () => {
      // A sheet closing: this one may wait for the keyboard.
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [active]);
  return releaseNow;
}
