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
}

export interface LockableWindow {
  scrollY: number;
  scrollTo: (x: number, y: number) => void;
}

/**
 * Freeze the document scroll in place. Returns a release function that
 * reverts every style it set and restores the original scroll position
 * (instantly — html's `scroll-behavior: smooth` is suspended for the
 * restore so closing a sheet never animates the page).
 */
export function applyBodyScrollLock(
  doc: LockableDocument,
  win: LockableWindow,
): () => void {
  const scrollY = win.scrollY;
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

  let released = false;
  return () => {
    if (released) return; // idempotent — double-release must be harmless
    released = true;
    body.position = prev.position;
    body.top = prev.top;
    body.left = prev.left;
    body.right = prev.right;
    body.width = prev.width;
    // Restore instantly: html carries `scroll-behavior: smooth`, which
    // would otherwise animate the jump back to the saved position.
    const html = doc.documentElement.style;
    const prevBehavior = html.scrollBehavior;
    html.scrollBehavior = "auto";
    win.scrollTo(0, scrollY);
    html.scrollBehavior = prevBehavior;
  };
}

/**
 * Lock the document scroll while `active` is true (e.g. a bottom sheet is
 * open). Reverts and restores the scroll position when `active` flips
 * false or the component unmounts.
 */
export function useBodyScrollLock(active: boolean): () => void {
  const releaseRef = useRef<(() => void) | null>(null);
  // Links release synchronously, before Next scrolls to the destination hash.
  // The later effect cleanup must not restore the old page over that position.
  const releaseNow = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const release = applyBodyScrollLock(
      document as unknown as LockableDocument,
      window as unknown as LockableWindow,
    );
    releaseRef.current = release;
    return releaseNow;
  }, [active, releaseNow]);
  return releaseNow;
}
