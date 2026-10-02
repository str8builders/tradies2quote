/**
 * Text size: Normal, Large or Extra large, set per device.
 *
 * Works exactly like outdoor mode (src/lib/ui/outdoor.ts): a plain cookie
 * (`t2q-text`, one year) so it follows the phone and not the account; the
 * server reads it in src/app/app/layout.tsx and renders `data-text` on the app
 * shell, so the first paint is already the right size (no flash); and
 * <TextSizeControl> writes the cookie and flips the attribute live.
 *
 * The size itself is plain CSS (globals.css, "Text size"): inside an element
 * with `data-text="large"` or `"xlarge"` every --text-* size variable is
 * bigger, so every kit and Tailwind text class that reads one scales with it.
 * Pinch zoom stays locked in the app on purpose (a focused field would zoom the
 * page and never zoom back), so this is the way to make everything bigger.
 *
 * Pure and isomorphic: no document/window access at import time.
 */

import { CONTRAST_ROOT_ATTRIBUTE } from "./outdoor";

export const TEXT_SIZE_COOKIE = "t2q-text";
export const TEXT_SIZE_MAX_AGE_S = 365 * 24 * 60 * 60;

/** The attribute the sizes switch on. Absent means Normal. */
export const TEXT_SIZE_ATTRIBUTE = "data-text";

export type TextSize = "normal" | "large" | "xlarge";

export const TEXT_SIZES: readonly TextSize[] = ["normal", "large", "xlarge"];

export const TEXT_SIZE_LABELS: Readonly<Record<TextSize, string>> = {
  normal: "Normal",
  large: "Large",
  xlarge: "Extra large",
};

/** How much bigger each size is than Normal (globals.css scales its variables by these). */
export const TEXT_SIZE_SCALE: Readonly<Record<TextSize, number>> = {
  normal: 1,
  large: 1.15,
  xlarge: 1.3,
};

/** A stored value as a size: anything but "large" or "xlarge" is Normal. */
export function parseTextSizeValue(value: string | null | undefined): TextSize {
  return value === "large" || value === "xlarge" ? value : "normal";
}

/** The setting from a Cookie header / document.cookie string. */
export function parseTextSizeCookie(cookieString: string | null | undefined): TextSize {
  if (!cookieString) return "normal";
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TEXT_SIZE_COOKIE) return parseTextSizeValue(rest.join("="));
  }
  return "normal";
}

/** The `data-text` value to render for a size (absent for Normal). */
export function textSizeAttributeValue(size: TextSize): "large" | "xlarge" | undefined {
  return size === "normal" ? undefined : size;
}

/** A `document.cookie` assignment that stores (large, xlarge) or clears (normal) the setting. */
export function textSizeCookieString(size: TextSize, secure: boolean): string {
  const flags = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return size === "normal"
    ? `${TEXT_SIZE_COOKIE}=; Max-Age=0; ${flags}`
    : `${TEXT_SIZE_COOKIE}=${size}; Max-Age=${TEXT_SIZE_MAX_AGE_S}; ${flags}`;
}

export interface TextRootLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute?(name: string): string | null;
}

export interface TextDocumentLike {
  querySelectorAll(selector: string): Iterable<TextRootLike> | ArrayLike<TextRootLike>;
}

/** Set the size on every contrast root on the page (the app shell). Returns how many changed. */
export function applyTextSizeAttribute(doc: TextDocumentLike, size: TextSize): number {
  const roots = Array.from(doc.querySelectorAll(`[${CONTRAST_ROOT_ATTRIBUTE}]`));
  const value = textSizeAttributeValue(size);
  for (const root of roots) {
    if (value) root.setAttribute(TEXT_SIZE_ATTRIBUTE, value);
    else root.removeAttribute(TEXT_SIZE_ATTRIBUTE);
  }
  return roots.length;
}

/** Fired on window after the setting changes, so every control on the page agrees. */
export const TEXT_SIZE_CHANGE_EVENT = "t2q-text-size-change";

export interface TextSizeReadableDocument {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
  cookie: string;
}

/** The size as the page shows it now: the first contrast root, else the cookie. */
export function readTextSize(doc: TextSizeReadableDocument): TextSize {
  const root = doc.querySelector(`[${CONTRAST_ROOT_ATTRIBUTE}]`);
  if (root) return parseTextSizeValue(root.getAttribute(TEXT_SIZE_ATTRIBUTE));
  return parseTextSizeCookie(doc.cookie);
}

/** Browser-only: store the size and repaint the page. Never throws. */
export function setTextSize(size: TextSize): void {
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:";
    document.cookie = textSizeCookieString(size, secure);
  } catch {
    /* Cookies blocked: the page still changes until the next load. */
  }
  try {
    applyTextSizeAttribute(document, size);
    window.dispatchEvent(new Event(TEXT_SIZE_CHANGE_EVENT));
  } catch {
    /* Not in a browser. */
  }
}
