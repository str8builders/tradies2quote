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
  KEYBOARD_WAIT_MS,
  applyBodyScrollLock,
  type LockableDocument,
  type LockableViewport,
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

/**
 * A phone: a viewport the keyboard can shrink and slide, timers run by hand,
 * and a scrollTo that really moves the page.
 */
function makePhone(scrollY: number) {
  const listeners = new Set<() => void>();
  const timers: Array<{ id: number; ms: number; run: () => void }> = [];
  let nextId = 1;
  let blurred = 0;
  const viewport: LockableViewport = {
    height: 932,
    offsetTop: 0,
    scale: 1,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const scrolls: number[] = [];
  const win: LockableWindow = {
    scrollY,
    scrollTo: (_x, y) => {
      scrolls.push(y);
      win.scrollY = y;
    },
    innerHeight: 932,
    visualViewport: viewport,
    setTimeout: (run, ms) => {
      const id = nextId++;
      timers.push({ id, ms, run });
      return id;
    },
    clearTimeout: (id) => {
      const at = timers.findIndex((t) => t.id === (id as number));
      if (at !== -1) timers.splice(at, 1);
    },
    location: { href: "https://example.test/app/quotes/preview/1" },
  };
  const doc: LockableDocument = {
    body: { style: { position: "", top: "", left: "", right: "", width: "" } },
    documentElement: { style: { scrollBehavior: "smooth" } },
    activeElement: { blur: () => void blurred++ },
  };
  return {
    doc,
    win,
    scrolls,
    listening: () => listeners.size,
    blurred: () => blurred,
    waiting: () => timers.map((t) => t.ms),
    /** The keyboard comes up: the viewport shrinks and slides. */
    keyboardUp: () => {
      viewport.height = 520;
      viewport.offsetTop = 68;
    },
    /** The keyboard goes: the viewport is whole again, and says so. */
    keyboardDown: () => {
      viewport.height = 932;
      viewport.offsetTop = 0;
      [...listeners].forEach((l) => l());
    },
    /** Run the timers due at or under `ms`. */
    tick: (ms: number) => {
      const due = timers.filter((t) => t.ms <= ms);
      due.forEach((t) => timers.splice(timers.indexOf(t), 1));
      due.forEach((t) => t.run());
    },
    viewport,
  };
}

describe("applyBodyScrollLock — releasing with the iPhone keyboard up", () => {
  it("puts the keyboard away first, and the page back once the viewport is whole", () => {
    const phone = makePhone(977);
    const release = applyBodyScrollLock(phone.doc, phone.win);
    phone.keyboardUp();
    release();
    // Still frozen: nothing is restored while the viewport is shrunk and slid.
    expect(phone.blurred()).toBe(1);
    expect(phone.doc.body.style.position).toBe("fixed");
    expect(phone.scrolls).toEqual([]);
    expect(phone.waiting()).toEqual([KEYBOARD_WAIT_MS]);

    phone.keyboardDown();
    expect(phone.doc.body.style.position).toBe("");
    expect(phone.scrolls).toEqual([977]);
    expect(phone.listening()).toBe(0);
    // The wait is over; only the settle check is left, and it finds nothing to fix.
    phone.tick(KEYBOARD_WAIT_MS);
    expect(phone.scrolls).toEqual([977]);
  });

  it("doesn't wait for ever: the page comes back after the longest wait", () => {
    const phone = makePhone(300);
    const release = applyBodyScrollLock(phone.doc, phone.win);
    phone.keyboardUp();
    release();
    phone.tick(KEYBOARD_WAIT_MS);
    expect(phone.doc.body.style.position).toBe("");
    expect(phone.scrolls).toEqual([300]);
  });

  it("with no keyboard, and for a link about to navigate, it releases at once", () => {
    const calm = makePhone(120);
    applyBodyScrollLock(calm.doc, calm.win)();
    expect(calm.scrolls).toEqual([120]);
    expect(calm.blurred()).toBe(0);
    expect(calm.waiting()).toEqual([]);

    const link = makePhone(120);
    const release = applyBodyScrollLock(link.doc, link.win);
    link.keyboardUp();
    release(true);
    expect(link.doc.body.style.position).toBe("");
    expect(link.scrolls).toEqual([120]);
  });

  it("a sheet opening while another's release waits can't leave the page frozen", () => {
    const phone = makePhone(977);
    const first = applyBodyScrollLock(phone.doc, phone.win);
    phone.keyboardUp();
    first(); // waiting for the keyboard
    const second = applyBodyScrollLock(phone.doc, phone.win); // finishes the first, then locks
    expect(phone.scrolls).toEqual([977]);
    expect(phone.doc.body.style.position).toBe("fixed");
    expect(phone.doc.body.style.top).toBe("-977px");
    expect(phone.waiting()).toEqual([]);
    phone.keyboardDown();
    second();
    expect(phone.doc.body.style.position).toBe("");
    expect(phone.doc.body.style.top).toBe("");
    expect(phone.scrolls).toEqual([977, 977]);
  });

  it("leaves a page opened meanwhile where it is", () => {
    const phone = makePhone(977);
    const release = applyBodyScrollLock(phone.doc, phone.win);
    phone.keyboardUp();
    release();
    phone.win.location = { href: "https://example.test/app/jobs" };
    phone.keyboardDown();
    expect(phone.doc.body.style.position).toBe("");
    expect(phone.scrolls).toEqual([]);
  });

  it("if the phone is still drawing the page lower than it thinks, one small scroll lines it up", () => {
    const phone = makePhone(977);
    const release = applyBodyScrollLock(phone.doc, phone.win);
    phone.keyboardUp();
    release();
    phone.tick(KEYBOARD_WAIT_MS); // the keyboard never reported going
    // Keyboard gone, but the viewport is left slid by 68 px.
    phone.viewport.height = 932;
    phone.viewport.offsetTop = 68;
    phone.tick(KEYBOARD_WAIT_MS);
    expect(phone.scrolls).toEqual([977, 976, 977]);
    expect(phone.doc.documentElement.style.scrollBehavior).toBe("smooth");
  });
});

