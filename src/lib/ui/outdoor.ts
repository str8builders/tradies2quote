/**
 * Outdoor mode: a per-device, high-contrast palette for bright sun.
 *
 * Stored in a plain cookie (`t2q-outdoor=1`, one year) rather than the
 * profile so it follows the phone, not the account: the same tradie may want
 * it on the phone they use on site and off on the office laptop. The server
 * reads it in src/app/app/layout.tsx and renders `data-contrast="outdoor"`
 * on the app shell, so the first paint is already right (no flash).
 * <OutdoorModeToggle> writes the cookie and flips the attribute live.
 *
 * Only `ui-` tokens react to the attribute (see globals.css), so existing
 * screens look exactly the same with outdoor mode on or off.
 *
 * Pure and isomorphic: no document/window access at import time.
 */

export const OUTDOOR_COOKIE = "t2q-outdoor";
export const OUTDOOR_MAX_AGE_S = 365 * 24 * 60 * 60;

/** The attribute the palette switches on, and its outdoor value. */
export const CONTRAST_ATTRIBUTE = "data-contrast";
export const OUTDOOR_CONTRAST = "outdoor";

/**
 * Marks an element whose palette follows the device setting (the app shell,
 * the /ui-kit page root). The toggle flips every such root; elements that pin
 * a palette with a bare `data-contrast` (a side-by-side preview) are left alone.
 */
export const CONTRAST_ROOT_ATTRIBUTE = "data-contrast-root";

/** True only for the exact stored value "1". */
export function isOutdoorCookieValue(value: string | null | undefined): boolean {
  return value === "1";
}

/** Outdoor setting from a Cookie header / document.cookie string. */
export function parseOutdoorCookie(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false;
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === OUTDOOR_COOKIE) return isOutdoorCookieValue(rest.join("="));
  }
  return false;
}

/** The `data-contrast` value to render for a setting (absent when off). */
export function contrastAttributeValue(on: boolean): typeof OUTDOOR_CONTRAST | undefined {
  return on ? OUTDOOR_CONTRAST : undefined;
}

/** A `document.cookie` assignment that stores (on) or clears (off) the setting. */
export function outdoorCookieString(on: boolean, secure: boolean): string {
  const flags = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return on
    ? `${OUTDOOR_COOKIE}=1; Max-Age=${OUTDOOR_MAX_AGE_S}; ${flags}`
    : `${OUTDOOR_COOKIE}=; Max-Age=0; ${flags}`;
}

export interface ContrastRootLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface ContrastDocumentLike {
  querySelectorAll(selector: string): Iterable<ContrastRootLike> | ArrayLike<ContrastRootLike>;
}

/** Flip every contrast root on the page. Returns how many were changed. */
export function applyOutdoorAttribute(doc: ContrastDocumentLike, on: boolean): number {
  const roots = Array.from(doc.querySelectorAll(`[${CONTRAST_ROOT_ATTRIBUTE}]`));
  for (const root of roots) {
    if (on) root.setAttribute(CONTRAST_ATTRIBUTE, OUTDOOR_CONTRAST);
    else root.removeAttribute(CONTRAST_ATTRIBUTE);
  }
  return roots.length;
}

/** Fired on window after the setting changes, so every toggle on the page agrees. */
export const OUTDOOR_CHANGE_EVENT = "t2q-outdoor-change";

export interface OutdoorReadableDocument {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
  cookie: string;
}

/** The setting as the page shows it now: the first contrast root, else the cookie. */
export function readOutdoorMode(doc: OutdoorReadableDocument): boolean {
  const root = doc.querySelector(`[${CONTRAST_ROOT_ATTRIBUTE}]`);
  if (root) return root.getAttribute(CONTRAST_ATTRIBUTE) === OUTDOOR_CONTRAST;
  return parseOutdoorCookie(doc.cookie);
}

/** Browser-only: store the setting and repaint the page. Never throws. */
export function setOutdoorMode(on: boolean): void {
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:";
    document.cookie = outdoorCookieString(on, secure);
  } catch {
    /* Cookies blocked: the page still switches until the next load. */
  }
  try {
    applyOutdoorAttribute(document, on);
    window.dispatchEvent(new Event(OUTDOOR_CHANGE_EVENT));
  } catch {
    /* Not in a browser. */
  }
}
