/**
 * Text size: Normal, Large or Extra large, set per device.
 *
 * Works exactly like outdoor mode (src/lib/ui/outdoor.ts): a plain cookie
 * (`t2q-text`, one year) so it follows the phone and not the account; the
 * server reads it in src/app/app/layout.tsx and renders `data-text` on the app
 * shell, so the first paint is already the right size (no flash); and
 * <TextSizeControl> writes the cookie and flips the attribute live.
 *
 * In the iPhone app, until the person picks a size there, the size follows the
 * text size they set for the whole phone (Settings > Display & Brightness >
 * Text Size, or Larger Text in Accessibility): <PhoneTextSize> reads it and
 * keeps it in a second cookie (`t2q-text-auto`) the server reads the same way.
 * A size picked in the app (Normal included) always wins.
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
/** The size the phone's own text size setting asks for, while none is picked in the app. */
export const TEXT_SIZE_AUTO_COOKIE = "t2q-text-auto";
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

/** A size the person picked, or null when they haven't (no cookie, or junk in it). */
export function pickedTextSize(value: string | null | undefined): TextSize | null {
  return value === "normal" || value === "large" || value === "xlarge" ? value : null;
}

/** What to show: the size picked in the app; else the phone's own text size; else Normal. */
export function resolveTextSize(picked: string | null | undefined, auto: string | null | undefined): TextSize {
  return pickedTextSize(picked) ?? parseTextSizeValue(auto);
}

/** A cookie store as Next's `cookies()` hands it over (only `get` is used). */
export interface TextSizeCookieStore {
  get(name: string): { value: string } | undefined;
}

/** The size for this request, from its cookies (server). */
export function textSizeFromCookies(store: TextSizeCookieStore): TextSize {
  return resolveTextSize(store.get(TEXT_SIZE_COOKIE)?.value, store.get(TEXT_SIZE_AUTO_COOKIE)?.value);
}

function cookieValue(cookieString: string | null | undefined, cookieName: string): string | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === cookieName) return rest.join("=");
  }
  return null;
}

/** The size from a Cookie header / document.cookie string. */
export function parseTextSizeCookie(cookieString: string | null | undefined): TextSize {
  return resolveTextSize(cookieValue(cookieString, TEXT_SIZE_COOKIE), cookieValue(cookieString, TEXT_SIZE_AUTO_COOKIE));
}

/** True once a size has been picked in the app (Normal included). */
export function hasPickedTextSize(cookieString: string | null | undefined): boolean {
  return pickedTextSize(cookieValue(cookieString, TEXT_SIZE_COOKIE)) !== null;
}

/** The `data-text` value to render for a size (absent for Normal). */
export function textSizeAttributeValue(size: TextSize): "large" | "xlarge" | undefined {
  return size === "normal" ? undefined : size;
}

/**
 * A `document.cookie` assignment that stores the size picked in the app.
 * Normal is stored too: once picked, the phone's own text size no longer decides.
 */
export function textSizeCookieString(size: TextSize, secure: boolean): string {
  const flags = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return `${TEXT_SIZE_COOKIE}=${size}; Max-Age=${TEXT_SIZE_MAX_AGE_S}; ${flags}`;
}

/** A `document.cookie` assignment that keeps (large, xlarge) or clears (null) the phone's size. */
export function autoTextSizeCookieString(size: "large" | "xlarge" | null, secure: boolean): string {
  const flags = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return size
    ? `${TEXT_SIZE_AUTO_COOKIE}=${size}; Max-Age=${TEXT_SIZE_MAX_AGE_S}; ${flags}`
    : `${TEXT_SIZE_AUTO_COOKIE}=; Max-Age=0; ${flags}`;
}

/**
 * The size for the phone's body text size in CSS pixels (iOS Dynamic Type:
 * 17 px is the default "Large"). One step up (19 px) is Large; two or more
 * (21 px and up, including the accessibility sizes) is Extra large. The
 * default and the smaller settings leave the app at Normal (null).
 */
export function textSizeForPhoneBody(px: number | null): "large" | "xlarge" | null {
  if (px === null || !Number.isFinite(px)) return null;
  if (px >= 21) return "xlarge";
  if (px >= 19) return "large";
  return null;
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

function secureContext(): boolean {
  return typeof location !== "undefined" && location.protocol === "https:";
}

/** Browser-only: store the size picked in the app and repaint the page. Never throws. */
export function setTextSize(size: TextSize): void {
  try {
    document.cookie = textSizeCookieString(size, secureContext());
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

/**
 * Browser-only: the phone's body text size in CSS pixels, read through
 * WebKit's `-apple-system-body` font (it follows the iPhone's text size
 * setting). Null where the keyword isn't known (any browser but Safari's
 * engine), so nothing changes there. Never throws.
 */
export function readPhoneBodyPx(doc: Document = document): number | null {
  try {
    const probe = doc.createElement("span");
    probe.style.font = "-apple-system-body";
    // An engine that doesn't know the keyword drops the whole declaration.
    if (!probe.style.font) return null;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.textContent = "x";
    doc.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return Number.isFinite(px) ? px : null;
  } catch {
    return null;
  }
}

/**
 * Browser-only: while no size is picked in the app, follow the phone's own
 * text size: keep it in the auto cookie (so the next load is already that
 * size) and repaint if it changed. Returns the size shown. Never throws.
 */
export function followPhoneTextSize(doc: Document = document): TextSize | null {
  try {
    if (hasPickedTextSize(doc.cookie)) return null;
    const size = textSizeForPhoneBody(readPhoneBodyPx(doc));
    doc.cookie = autoTextSizeCookieString(size, secureContext());
    const shown = size ?? "normal";
    if (readTextSize(doc) !== shown) {
      applyTextSizeAttribute(doc, shown);
      window.dispatchEvent(new Event(TEXT_SIZE_CHANGE_EVENT));
    }
    return shown;
  } catch {
    return null;
  }
}
