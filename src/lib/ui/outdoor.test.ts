import { describe, expect, it } from "vitest";
import {
  CONTRAST_ROOT_ATTRIBUTE,
  OUTDOOR_COOKIE,
  OUTDOOR_MAX_AGE_S,
  applyOutdoorAttribute,
  contrastAttributeValue,
  isOutdoorCookieValue,
  outdoorCookieString,
  parseOutdoorCookie,
} from "./outdoor";

describe("outdoor mode cookie", () => {
  it("is t2q-outdoor=1, kept for a year on every path, SameSite=Lax", () => {
    expect(OUTDOOR_COOKIE).toBe("t2q-outdoor");
    expect(OUTDOOR_MAX_AGE_S).toBe(31_536_000);
    expect(outdoorCookieString(true, false)).toBe(
      "t2q-outdoor=1; Max-Age=31536000; Path=/; SameSite=Lax",
    );
    expect(outdoorCookieString(true, true)).toBe(
      "t2q-outdoor=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure",
    );
  });

  it("clears with the same path and flags", () => {
    expect(outdoorCookieString(false, true)).toBe(
      "t2q-outdoor=; Max-Age=0; Path=/; SameSite=Lax; Secure",
    );
  });

  it("only the exact value 1 turns it on", () => {
    expect(isOutdoorCookieValue("1")).toBe(true);
    for (const v of ["", "0", "true", "yes", " 1", undefined, null]) {
      expect(isOutdoorCookieValue(v)).toBe(false);
    }
  });

  it("reads the setting out of a cookie header", () => {
    expect(parseOutdoorCookie("a=b; t2q-outdoor=1; sb-token=x")).toBe(true);
    expect(parseOutdoorCookie("t2q-outdoor=1")).toBe(true);
    expect(parseOutdoorCookie("t2q-outdoor=0")).toBe(false);
    expect(parseOutdoorCookie("not-t2q-outdoor=1")).toBe(false);
    expect(parseOutdoorCookie("")).toBe(false);
    expect(parseOutdoorCookie(null)).toBe(false);
  });

  it("maps to the data-contrast attribute value", () => {
    expect(contrastAttributeValue(true)).toBe("outdoor");
    expect(contrastAttributeValue(false)).toBeUndefined();
  });
});

describe("applyOutdoorAttribute", () => {
  function fakeRoot() {
    const attrs = new Map<string, string>();
    return {
      attrs,
      setAttribute: (name: string, value: string) => void attrs.set(name, value),
      removeAttribute: (name: string) => void attrs.delete(name),
    };
  }

  it("flips every contrast root and nothing else", () => {
    const roots = [fakeRoot(), fakeRoot()];
    const selectors: string[] = [];
    const doc = {
      querySelectorAll: (selector: string) => {
        selectors.push(selector);
        return roots;
      },
    };
    expect(applyOutdoorAttribute(doc, true)).toBe(2);
    expect(selectors).toEqual([`[${CONTRAST_ROOT_ATTRIBUTE}]`]);
    for (const r of roots) expect(r.attrs.get("data-contrast")).toBe("outdoor");
    applyOutdoorAttribute(doc, false);
    for (const r of roots) expect(r.attrs.has("data-contrast")).toBe(false);
  });

  it("is harmless on a page without a contrast root", () => {
    expect(applyOutdoorAttribute({ querySelectorAll: () => [] }, true)).toBe(0);
  });
});
