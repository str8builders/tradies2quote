import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { TextSizeControl } from "@/components/ui/text-size-control";
import {
  TEXT_SIZES,
  TEXT_SIZE_AUTO_COOKIE,
  TEXT_SIZE_COOKIE,
  autoTextSizeCookieString,
  hasPickedTextSize,
  pickedTextSize,
  resolveTextSize,
  textSizeForPhoneBody,
  textSizeFromCookies,
  TEXT_SIZE_LABELS,
  TEXT_SIZE_SCALE,
  applyTextSizeAttribute,
  parseTextSizeCookie,
  parseTextSizeValue,
  readTextSize,
  setTextSize,
  textSizeAttributeValue,
  textSizeCookieString,
  type TextRootLike,
} from "./text-size";

class Root implements TextRootLike {
  attrs = new Map<string, string>();
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
}

describe("the stored setting", () => {
  it("is Normal unless the cookie says Large or Extra large", () => {
    expect(parseTextSizeValue(undefined)).toBe("normal");
    expect(parseTextSizeValue("")).toBe("normal");
    expect(parseTextSizeValue("huge")).toBe("normal");
    expect(parseTextSizeValue("large")).toBe("large");
    expect(parseTextSizeValue("xlarge")).toBe("xlarge");
    expect(parseTextSizeCookie("a=1; t2q-text=xlarge; b=2")).toBe("xlarge");
    expect(parseTextSizeCookie("t2q-outdoor=1")).toBe("normal");
    expect(parseTextSizeCookie(null)).toBe("normal");
  });

  it("writes a year-long cookie for every size picked, Normal included", () => {
    expect(textSizeCookieString("large", true)).toBe(`${TEXT_SIZE_COOKIE}=large; Max-Age=31536000; Path=/; SameSite=Lax; Secure`);
    expect(textSizeCookieString("xlarge", false)).toBe(`${TEXT_SIZE_COOKIE}=xlarge; Max-Age=31536000; Path=/; SameSite=Lax`);
    // Normal is kept too: once picked in the app, the phone's own text size no longer decides.
    expect(textSizeCookieString("normal", true)).toBe(`${TEXT_SIZE_COOKIE}=normal; Max-Age=31536000; Path=/; SameSite=Lax; Secure`);
    for (const size of TEXT_SIZES) expect(parseTextSizeCookie(textSizeCookieString(size, false).split(";")[0])).toBe(size);
  });

  it("renders no attribute for Normal", () => {
    expect([TEXT_SIZES.map(textSizeAttributeValue)]).toEqual([[undefined, "large", "xlarge"]]);
  });
});

describe("the phone's own text size", () => {
  it("maps the iPhone body size: one step up is Large, two or more is Extra large", () => {
    for (const px of [null, Number.NaN, 14, 15, 16, 17]) expect(textSizeForPhoneBody(px)).toBeNull();
    expect(textSizeForPhoneBody(19)).toBe("large");
    expect(textSizeForPhoneBody(20)).toBe("large");
    for (const px of [21, 23, 28, 33, 40, 47, 53]) expect(textSizeForPhoneBody(px)).toBe("xlarge");
  });

  it("a size picked in the app always wins; else the phone's; else Normal", () => {
    expect(resolveTextSize(undefined, undefined)).toBe("normal");
    expect(resolveTextSize(undefined, "large")).toBe("large");
    expect(resolveTextSize(undefined, "xlarge")).toBe("xlarge");
    expect(resolveTextSize("normal", "xlarge")).toBe("normal");
    expect(resolveTextSize("large", "xlarge")).toBe("large");
    expect(resolveTextSize("junk", "large")).toBe("large");
    expect(resolveTextSize(undefined, "normal")).toBe("normal");
    expect(pickedTextSize("normal")).toBe("normal");
    expect(pickedTextSize("")).toBeNull();
  });

  it("reads both cookies, on the server and from document.cookie", () => {
    const store = (values: Record<string, string>) => ({ get: (name: string) => (name in values ? { value: values[name] } : undefined) });
    expect(textSizeFromCookies(store({}))).toBe("normal");
    expect(textSizeFromCookies(store({ [TEXT_SIZE_AUTO_COOKIE]: "xlarge" }))).toBe("xlarge");
    expect(textSizeFromCookies(store({ [TEXT_SIZE_AUTO_COOKIE]: "xlarge", [TEXT_SIZE_COOKIE]: "normal" }))).toBe("normal");
    expect(parseTextSizeCookie(`a=1; ${TEXT_SIZE_AUTO_COOKIE}=large`)).toBe("large");
    expect(parseTextSizeCookie(`${TEXT_SIZE_AUTO_COOKIE}=large; ${TEXT_SIZE_COOKIE}=normal`)).toBe("normal");
    expect(hasPickedTextSize(`${TEXT_SIZE_AUTO_COOKIE}=large`)).toBe(false);
    expect(hasPickedTextSize(`${TEXT_SIZE_COOKIE}=normal`)).toBe(true);
  });

  it("keeps the phone's size in its own cookie, or clears it", () => {
    expect(autoTextSizeCookieString("large", true)).toBe(`${TEXT_SIZE_AUTO_COOKIE}=large; Max-Age=31536000; Path=/; SameSite=Lax; Secure`);
    expect(autoTextSizeCookieString(null, false)).toBe(`${TEXT_SIZE_AUTO_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`);
  });
});

describe("applying it to the page", () => {
  it("sets data-text on every contrast root and removes it for Normal", () => {
    const roots = [new Root(), new Root()];
    const doc = { querySelectorAll: () => roots };
    expect(applyTextSizeAttribute(doc, "xlarge")).toBe(2);
    expect(roots.map((r) => r.getAttribute("data-text"))).toEqual(["xlarge", "xlarge"]);
    applyTextSizeAttribute(doc, "normal");
    expect(roots.map((r) => r.getAttribute("data-text"))).toEqual([null, null]);
  });

  it("reads the size from the page first, then the cookie", () => {
    const root = new Root();
    root.setAttribute("data-text", "large");
    expect(readTextSize({ querySelector: () => root, cookie: "t2q-text=xlarge" })).toBe("large");
    expect(readTextSize({ querySelector: () => null, cookie: "t2q-text=xlarge" })).toBe("xlarge");
    expect(readTextSize({ querySelector: () => null, cookie: "" })).toBe("normal");
  });

  it("setTextSize never throws where there is no page", () => {
    expect(() => setTextSize("large")).not.toThrow();
  });
});

describe("the sizes in globals.css", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const declarations = (header: string) => {
    const start = css.indexOf(header);
    expect(start, `${header} must exist`).toBeGreaterThan(-1);
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const base = declarations("@theme {\n  --font-ui-sans:");
  const rem = (v: string) => Number(v.replace("rem", ""));
  const NAMES = ["xs", "sm", "base", "lg", "xl", "2xl", "display"];

  it.each(["large", "xlarge"] as const)("%s makes every ui text size, and its line height, bigger", (size) => {
    const d = declarations(`[data-text="${size}"]`);
    for (const name of NAMES) {
      const font = rem(d[`--text-ui-${name}`]);
      const line = rem(d[`--text-ui-${name}--line-height`]);
      expect(font, `${size} ${name}`).toBeGreaterThan(rem(base[`--text-ui-${name}`]));
      expect(line, `${size} ${name} line height`).toBeGreaterThan(font);
      if (name !== "display") expect(font / rem(base[`--text-ui-${name}`])).toBeCloseTo(TEXT_SIZE_SCALE[size], 1);
    }
  });

  it("scales Tailwind's own sizes too, so screens that still use text-sm follow", () => {
    for (const size of ["large", "xlarge"] as const) {
      const d = declarations(`[data-text="${size}"]`);
      for (const name of ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"]) expect(d[`--text-${name}`], `${size} ${name}`).toMatch(/^calc\(/);
    }
  });

  it("Extra large is bigger than Large, and the display size stays small enough for a phone", () => {
    const large = declarations('[data-text="large"]');
    const xlarge = declarations('[data-text="xlarge"]');
    for (const name of NAMES) expect(rem(xlarge[`--text-ui-${name}`])).toBeGreaterThan(rem(large[`--text-ui-${name}`]));
    expect(rem(xlarge["--text-ui-display"])).toBeLessThanOrEqual(2.75);
  });
});

describe("the layout hooks in globals.css", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) sources.push(readFileSync(path, "utf8"));
    }
  };
  walk(join(process.cwd(), "src"));
  const hooks = [...new Set([...css.matchAll(/\[data-text(?:="[a-z]+")?\] \[(data-[a-z-]+)\]/g)].map((m) => m[1]))];

  it("covers the headings, rows, tiles, chips and bottom bar that need room at a bigger size", () => {
    for (const hook of [
      "data-tab-bar-row",
      "data-tab-bar-title",
      "data-app-nav",
      "data-list-row",
      "data-list-row-chevron",
      "data-list-row-trailing",
      "data-text-stack",
      "data-filter-chips",
      "data-text-wrap",
      "data-text-clamp",
      "data-rail-odd",
    ]) {
      expect(hooks, hook).toContain(hook);
    }
  });

  it.each(hooks)("%s is put on an element by a component, so its rule has something to style", (hook) => {
    const used = sources.some((source) => new RegExp(`(?:\\s|^)${hook}(?=[\\s=>/])`).test(source));
    expect(used, `no component renders ${hook}`).toBe(true);
  });
});

describe("<TextSizeControl>", () => {
  it("offers the three sizes and marks the one the server rendered with", () => {
    const html = renderToStaticMarkup(createElement(TextSizeControl, { initial: "large" }));
    for (const size of TEXT_SIZES) expect(html).toContain(TEXT_SIZE_LABELS[size]);
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-checked="true"[^>]*>Large</);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
});
