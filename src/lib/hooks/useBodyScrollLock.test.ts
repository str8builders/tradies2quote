// ─────────────────────────────────────────────────────────────────────────
// Scoped body scroll-lock — pure-core tests (node, no jsdom dependency).
//
// The lock must: freeze the body exactly at the current scroll offset,
// revert every style it touched, restore the original scroll position
// INSTANTLY (suspending html's smooth scroll-behavior), and be idempotent
// on double-release. These lock the contract that the document remains
// the shell's scroll owner whenever no sheet is open.
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  applyBodyScrollLock,
  type LockableDocument,
  type LockableWindow,
} from "./useBodyScrollLock";

function makeDoc(): LockableDocument {
  return {
    body: {
      style: { position: "", top: "", left: "", right: "", width: "" },
    },
    documentElement: { style: { scrollBehavior: "smooth" } },
  };
}

function makeWin(scrollY: number) {
  const calls: Array<{ x: number; y: number; behaviorAtCall: string }> = [];
  let docRef: LockableDocument | null = null;
  const win: LockableWindow = {
    scrollY,
    scrollTo: (x, y) =>
      calls.push({
        x,
        y,
        behaviorAtCall: docRef?.documentElement.style.scrollBehavior ?? "?",
      }),
  };
  return {
    win,
    calls,
    bind: (doc: LockableDocument) => {
      docRef = doc;
    },
  };
}

describe("applyBodyScrollLock — scoped modal scroll lock", () => {
  it("freezes the body at the current scroll offset", () => {
    const doc = makeDoc();
    const { win } = makeWin(742);
    applyBodyScrollLock(doc, win);
    expect(doc.body.style.position).toBe("fixed");
    expect(doc.body.style.top).toBe("-742px");
    expect(doc.body.style.left).toBe("0");
    expect(doc.body.style.right).toBe("0");
    expect(doc.body.style.width).toBe("100%");
  });

  it("release reverts every style and restores the scroll position", () => {
    const doc = makeDoc();
    const { win, calls, bind } = makeWin(742);
    bind(doc);
    const release = applyBodyScrollLock(doc, win);
    release();
    expect(doc.body.style).toEqual({
      position: "",
      top: "",
      left: "",
      right: "",
      width: "",
    });
    expect(calls).toEqual([{ x: 0, y: 742, behaviorAtCall: "auto" }]);
    // smooth scroll-behavior is restored after the instant jump.
    expect(doc.documentElement.style.scrollBehavior).toBe("smooth");
  });

  it("preserves pre-existing inline body styles on release", () => {
    const doc = makeDoc();
    doc.body.style.position = "relative";
    doc.body.style.width = "50%";
    const { win } = makeWin(10);
    const release = applyBodyScrollLock(doc, win);
    expect(doc.body.style.position).toBe("fixed"); // locked
    release();
    expect(doc.body.style.position).toBe("relative"); // restored, not cleared
    expect(doc.body.style.width).toBe("50%");
  });

  it("double-release is harmless (idempotent)", () => {
    const doc = makeDoc();
    const { win, calls, bind } = makeWin(300);
    bind(doc);
    const release = applyBodyScrollLock(doc, win);
    release();
    release(); // second call must be a no-op
    expect(calls.length).toBe(1);
    expect(doc.body.style.position).toBe("");
  });

  it("zero scroll offset locks and restores at 0", () => {
    const doc = makeDoc();
    const { win, calls, bind } = makeWin(0);
    bind(doc);
    const release = applyBodyScrollLock(doc, win);
    expect(doc.body.style.top).toBe("-0px");
    release();
    expect(calls[0]).toMatchObject({ x: 0, y: 0 });
  });
  it("an immediate navigation release cannot later reset the destination scroll", () => {
    const doc = makeDoc();
    const { win, calls, bind } = makeWin(742);
    bind(doc);
    const release = applyBodyScrollLock(doc, win);
    release(); // account link, before Next handles its hash
    win.scrollTo(0, 160); // destination profile section
    release(); // passive effect cleanup after navigation
    expect(calls.map((call) => call.y)).toEqual([742, 160]);
    expect(doc.body.style.position).toBe("");
  });

});
