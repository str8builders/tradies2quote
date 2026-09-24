// Focus trap for <BottomSheet> — node tests with a tiny fake DOM, like the
// useBodyScrollLock tests. Covers: initial focus, Tab wrap both ways, focus
// pulled back in, Escape, and focus restored to the opener on release.

import { describe, expect, it, vi } from "vitest";
import {
  FOCUSABLE_SELECTOR,
  activateFocusTrap,
  tabTarget,
  type TrapDocument,
  type TrapElement,
  type TrapKeyEvent,
} from "./focus-trap";

type FakeEl = TrapElement & { name: string; hidden?: boolean };

function makeDom(names: string[]) {
  const doc = {
    activeElement: null as unknown,
    listeners: [] as Array<(e: TrapKeyEvent) => void>,
    addEventListener: (_t: string, l: (e: TrapKeyEvent) => void) => void doc.listeners.push(l),
    removeEventListener: (_t: string, l: (e: TrapKeyEvent) => void) => {
      doc.listeners = doc.listeners.filter((x) => x !== l);
    },
  };
  const el = (name: string): FakeEl => {
    const e: FakeEl = {
      name,
      isConnected: true,
      focus: () => {
        doc.activeElement = e;
      },
      getAttribute: () => null,
      getClientRects: () => ({ length: e.hidden ? 0 : 1 }),
    };
    return e;
  };
  const items = names.map(el);
  const opener = el("opener");
  const outsider = el("outsider");
  const container = {
    name: "panel",
    focus: () => {
      doc.activeElement = container;
    },
    contains: (node: unknown) => node === container || items.includes(node as FakeEl),
    querySelectorAll: (selector: string) => {
      expect(selector).toBe(FOCUSABLE_SELECTOR);
      return items;
    },
  };
  const press = (key: string, shiftKey = false) => {
    const event = { key, shiftKey, prevented: false, preventDefault: () => void (event.prevented = true) };
    for (const l of doc.listeners) l(event);
    return event;
  };
  return { doc: doc as TrapDocument & typeof doc, items, opener, outsider, container, press };
}

describe("focus trap", () => {
  it("focuses the first focusable element when it opens", () => {
    const dom = makeDom(["close", "amount", "save"]);
    dom.opener.focus();
    activateFocusTrap({ doc: dom.doc, container: dom.container });
    expect(dom.doc.activeElement).toBe(dom.items[0]);
  });

  it("focuses the requested element instead, when given", () => {
    const dom = makeDom(["close", "amount", "save"]);
    activateFocusTrap({ doc: dom.doc, container: dom.container, initialFocus: dom.items[1] });
    expect(dom.doc.activeElement).toBe(dom.items[1]);
  });

  it("falls back to the panel itself when nothing inside can take focus", () => {
    const dom = makeDom([]);
    activateFocusTrap({ doc: dom.doc, container: dom.container });
    expect(dom.doc.activeElement).toBe(dom.container);
    expect(dom.press("Tab").prevented).toBe(true);
    expect(dom.doc.activeElement).toBe(dom.container);
  });

  it("Tab on the last element wraps to the first, Shift+Tab on the first wraps to the last", () => {
    const dom = makeDom(["close", "amount", "save"]);
    activateFocusTrap({ doc: dom.doc, container: dom.container });
    dom.items[2].focus();
    expect(dom.press("Tab").prevented).toBe(true);
    expect(dom.doc.activeElement).toBe(dom.items[0]);
    expect(dom.press("Tab", true).prevented).toBe(true);
    expect(dom.doc.activeElement).toBe(dom.items[2]);
  });

  it("leaves ordinary Tab moves inside the sheet to the browser", () => {
    const dom = makeDom(["close", "amount", "save"]);
    activateFocusTrap({ doc: dom.doc, container: dom.container });
    dom.items[1].focus();
    expect(dom.press("Tab").prevented).toBe(false);
    expect(dom.press("Tab", true).prevented).toBe(false);
  });

  it("pulls focus back inside if it escaped", () => {
    const dom = makeDom(["close", "amount", "save"]);
    activateFocusTrap({ doc: dom.doc, container: dom.container });
    dom.outsider.focus();
    dom.press("Tab");
    expect(dom.doc.activeElement).toBe(dom.items[0]);
    dom.outsider.focus();
    dom.press("Tab", true);
    expect(dom.doc.activeElement).toBe(dom.items[2]);
  });

  it("skips hidden elements", () => {
    const dom = makeDom(["close", "amount", "save"]);
    dom.items[2].hidden = true;
    activateFocusTrap({ doc: dom.doc, container: dom.container });
    dom.items[1].focus();
    dom.press("Tab");
    expect(dom.doc.activeElement).toBe(dom.items[0]);
  });

  it("Escape asks to close and stops the browser default", () => {
    const dom = makeDom(["close"]);
    const onEscape = vi.fn();
    activateFocusTrap({ doc: dom.doc, container: dom.container, onEscape });
    expect(dom.press("Escape").prevented).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(dom.press("Enter").prevented).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("release restores focus to the opener and stops listening (idempotent)", () => {
    const dom = makeDom(["close", "save"]);
    const onEscape = vi.fn();
    dom.opener.focus();
    const release = activateFocusTrap({ doc: dom.doc, container: dom.container, onEscape });
    expect(dom.doc.activeElement).toBe(dom.items[0]);
    release();
    expect(dom.doc.activeElement).toBe(dom.opener);
    expect(dom.doc.listeners).toHaveLength(0);
    dom.press("Escape");
    expect(onEscape).not.toHaveBeenCalled();
    dom.items[1].focus();
    release();
    expect(dom.doc.activeElement).toBe(dom.items[1]);
  });

  it("does not try to focus an opener that has left the page", () => {
    const dom = makeDom(["close"]);
    dom.opener.focus();
    const release = activateFocusTrap({ doc: dom.doc, container: dom.container });
    dom.opener.isConnected = false;
    release();
    expect(dom.doc.activeElement).toBe(dom.items[0]);
  });
});

describe("tabTarget", () => {
  const a = { focus() {} };
  const b = { focus() {} };
  const c = { focus() {} };
  it("wraps only at the ends", () => {
    expect(tabTarget([a, b, c], c, false)).toBe(a);
    expect(tabTarget([a, b, c], a, true)).toBe(c);
    expect(tabTarget([a, b, c], b, false)).toBeNull();
    expect(tabTarget([a, b, c], null, false)).toBe(a);
    expect(tabTarget([a, b, c], null, true)).toBe(c);
    expect(tabTarget([], null, false)).toBeNull();
  });
});
