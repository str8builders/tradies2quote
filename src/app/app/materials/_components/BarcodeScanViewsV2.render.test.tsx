// The barcode scanner in the new look (look="new"). Every state the tradie can
// see follows the design rules, and each screen keeps the classic look's test
// ids and roles, so the flow and its tests work the same in both looks.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, createRef, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../barcode-actions", () => ({ lookupBarcodeAction: vi.fn(), saveBarcodeMaterialAction: vi.fn() }));

import { buttonClasses } from "@/components/ui/button";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import type { BarcodeMaterial } from "../barcode-actions";
import * as Classic from "./BarcodeScanViews";
import type { CameraStatus, ScanLook } from "./BarcodeScanViews";
import * as V2 from "./BarcodeScanViewsV2";
import { BarcodeScanSheet } from "./BarcodeScanSheet";
import { OpeningScanner, ScanBarcodeButton } from "./ScanBarcodeButton";

const noop = () => undefined;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const sika = { id: "m1", name: "Sikaflex 11FC grey", unit: "each", default_unit_price: 14.35, category: null };
const pine = { id: "p1", name: "Pine 90x45", unit: "m", default_unit_price: null };
const CODE = "4006381333931";
const STATUSES: CameraStatus[] = ["starting", "live", "paused", "denied", "busy", "unavailable", "error", "reader"];

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}
const testIds = (markup: string) => [...markup.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
const roles = (markup: string) => [...markup.matchAll(/\brole="([^"]+)"/g)].map((m) => m[1]);

/** Each screen, drawn in either look from the same props. */
const views = (look: ScanLook) => {
  const V = look === "new" ? V2 : Classic;
  return {
    camera: (status: CameraStatus, hint: string | null = null) =>
      html(
        createElement(V.CameraStep, {
          status,
          hint,
          videoRef: createRef<HTMLVideoElement>(),
          viewRef: createRef<HTMLDivElement>(),
          onRetry: noop,
          onTakePhoto: noop,
          onTypeNumber: noop,
        }),
      ),
    typeNumber: (error: string | null) =>
      html(createElement(V.TypeNumberStep, { error, onSubmit: noop, onUseCamera: noop })),
    busy: () => html(createElement(V.BusyStep, { label: "Checking your library…" })),
    found: (mode: Classic.ScanMode, added = false, material: BarcodeMaterial = sika) =>
      html(
        createElement(V.FoundStep, {
          mode,
          material,
          code: CODE,
          currency: "NZD",
          added,
          onAddToQuote: noop,
          onOpen: noop,
          onScanAnother: noop,
          onDone: noop,
        }),
      ),
    newProduct: (over: Partial<ComponentProps<typeof V2.NewProductStep>> = {}) =>
      html(
        createElement(V.NewProductStep, {
          mode: "quote",
          code: CODE,
          currency: "NZD",
          library: [],
          saving: false,
          error: null,
          conflict: null,
          onSave: noop,
          onAttach: noop,
          onScanAnother: noop,
          ...over,
        }),
      ),
    saved: (mode: Classic.ScanMode, replaced = false, attached = false) =>
      html(
        createElement(V.SavedStep, {
          mode,
          material: sika,
          currency: "NZD",
          attached,
          replaced,
          onOpen: noop,
          onScanAnother: noop,
          onDone: noop,
        }),
      ),
    error: (message: string) =>
      html(createElement(V.ErrorStep, { message, retryLabel: "Try again", onRetry: noop, onTypeNumber: noop })),
  };
};

const now = views("new");
const before = views("classic");
const clash = {
  error: 'You already have "Pine 90x45" in your library. Add this barcode to it instead?',
  conflict: { kind: "name" as const, id: "p1", name: "Pine 90x45" },
};
const picker = (library: Classic.LibraryPick[], disabled = false) =>
  html(createElement(V2.LibraryPicker, { library, currency: "NZD", disabled, onPick: noop, onBack: noop }));
const sheet = (mode: Classic.ScanMode, look: ScanLook = "new") =>
  html(createElement(BarcodeScanSheet, { mode, currency: "NZD", onClose: noop, look }));
const trigger = (props: Partial<ComponentProps<typeof ScanBarcodeButton>> = {}) =>
  html(createElement(ScanBarcodeButton, { mode: "quote", currency: "NZD", ...props }));

/** The same state in both looks: [name, classic markup, new-look markup]. */
const PAIRS: Array<[string, string, string]> = [
  ...STATUSES.map((s): [string, string, string] => [`camera ${s}`, before.camera(s), now.camera(s)]),
  ["camera live with a hint", before.camera("live", "Too short."), now.camera("live", "Too short.")],
  ["type the number", before.typeNumber(null), now.typeNumber(null)],
  ["type the number, typo", before.typeNumber("Those don't add up."), now.typeNumber("Those don't add up.")],
  ["busy", before.busy(), now.busy()],
  ["found in a quote", before.found("quote"), now.found("quote")],
  ["found on the prices page", before.found("library"), now.found("library")],
  ["found and added", before.found("quote", true), now.found("quote", true)],
  ["found, no price", before.found("quote", false, { ...sika, default_unit_price: null }), now.found("quote", false, { ...sika, default_unit_price: null })],
  ["new product", before.newProduct(), now.newProduct()],
  ["new product, library page", before.newProduct({ mode: "library", library: [sika] }), now.newProduct({ mode: "library", library: [sika] })],
  ["new product, saving", before.newProduct({ saving: true, library: [sika] }), now.newProduct({ saving: true, library: [sika] })],
  ["new product, name clash", before.newProduct(clash), now.newProduct(clash)],
  ["saved on the prices page", before.saved("library"), now.saved("library")],
  ["saved in a quote, old barcode replaced", before.saved("quote", true, true), now.saved("quote", true, true)],
  ["error", before.error("We couldn't check that barcode."), now.error("We couldn't check that barcode.")],
  ["the sheet", sheet("quote", "classic"), sheet("quote")],
];

/** Everything the tradie can see in the new look. */
const NEW_LOOK: Array<[string, string]> = [
  ...PAIRS.map(([name, , markup]): [string, string] => [name, markup]),
  ["library picker", picker([sika, pine])],
  ["library picker while saving", picker([sika], true)],
  ["library picker, empty library", picker([])],
  ["loading the scanner", html(createElement(OpeningScanner, { look: "new" }))],
  ["the Scan barcode button", trigger({ look: "new" })],
];

describe("new-look scanner follows the design rules", () => {
  it.each(NEW_LOOK)("%s", (_name, markup) => {
    expect(markupRuleBreaks(markup)).toEqual([]);
  });

  it("and so does its source", () => {
    const path = join(process.cwd(), "src/app/app/materials/_components/BarcodeScanViewsV2.tsx");
    expect(sourceRuleBreaks(readFileSync(path, "utf8"))).toEqual([]);
  });

  it("carries nothing over from the old look", () => {
    for (const [name, markup] of NEW_LOOK) {
      for (const old of ["t2q-", "font-display", "bg-ink", "text-ink", "text-white", "bg-black", "red-500"]) {
        expect(markup, `${name}: ${old}`).not.toContain(old);
      }
    }
  });

  it("gives every button a big thumb target (48 px, 56 px for the main one)", () => {
    for (const [name, markup] of NEW_LOOK) {
      for (const button of markup.match(/<button[^>]*>/g) ?? []) expect(button, name).toMatch(/min-h-1[2-6]|h-12/);
    }
  });
});

describe("new-look scanner keeps the classic flow", () => {
  it.each(PAIRS)("%s: the same test ids and roles", (_name, classic, markup) => {
    expect(testIds(markup)).toEqual(testIds(classic));
    // The kit sheet is a <dialog>, a modal by showModal() rather than by role.
    expect(roles(markup)).toEqual(roles(classic).filter((role) => role !== "dialog"));
  });

  it("shows the live camera the way WKWebView needs it: inline, muted, autoplaying", () => {
    expect(now.camera("live")).toMatch(/<video[^>]*playsinline=""[^>]*muted=""[^>]*autoplay=""/i);
  });

  it("keeps the viewfinder dark from ui- tokens: chrome behind the picture, the scrim around the frame", () => {
    const markup = now.camera("live");
    expect(markup).toContain("bg-ui-chrome");
    expect(markup).toContain("shadow-[0_0_0_200vmax_var(--color-ui-scrim)]");
    expect(markup).toContain("animate-ui-pulse motion-reduce:animate-none");
    expect(now.camera("starting")).toMatch(/animate-spin [^"]*text-ui-hivis motion-reduce:animate-spin-calm/);
  });

  it("explains a blocked camera in an alert, with Try again only where it can help", () => {
    expect(now.camera("denied")).toMatch(/role="alert"[^>]*>Camera access is turned off for Tradies2Quote/);
    expect(now.camera("denied")).not.toContain("<video");
    expect(now.camera("denied")).toContain(">Try again<");
    expect(now.camera("unavailable")).toContain("Take a photo of the barcode or type the number instead.");
    expect(now.camera("unavailable")).not.toContain(">Try again<");
  });

  it("says what the camera is doing, and why a read was skipped", () => {
    expect(now.camera("live")).toMatch(/role="status" aria-live="polite"[^>]*>Point the camera at the barcode/);
    expect(now.camera("live", "That code is too short to be a product barcode.")).toContain("too short");
    expect(now.camera("paused")).toContain("Start the camera");
  });

  it("types the number on the number keypad, and reads a typo out", () => {
    expect(now.typeNumber(null)).toMatch(/inputmode="numeric"/i);
    const typo = now.typeNumber("Those numbers don't add up to a real barcode.");
    expect(tag(typo, 'data-testid="barcode-number-input"')).toContain('aria-invalid="true"');
    expect(typo).toMatch(/role="alert"[\s\S]*don&#x27;t add up/);
  });

  it("found: the product and the tradie's price, never $0", () => {
    const markup = now.found("quote");
    expect(markup).toContain("Sikaflex 11FC grey");
    expect(tag(markup, 'data-testid="barcode-found-price"')).toContain("tabular-nums");
    expect(markup).toContain("$14.35 / each");
    expect(tag(markup, 'data-testid="barcode-add-to-quote"')).toContain("bg-ui-brand");
    expect(now.found("quote", true)).toContain("Added as 1 each.");
    expect(now.found("quote", false, { ...sika, default_unit_price: null })).toContain("No price saved yet");
  });

  it("new product: the same fields, units and save words", () => {
    const markup = now.newProduct();
    expect(markup).toContain("What is this?");
    expect(markup).toMatch(/inputmode="decimal"/i);
    expect(markup).toContain(CODE);
    const units = [...markup.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    expect(units).toEqual(["each", "m", "m²", "box", "bag", "sheet", "L", "kg", "roll", "pack"]);
    expect(tag(markup, 'type="checkbox"')).toContain("accent-ui-brand");
    expect(markup).toContain("This price includes GST (we&#x27;ll save it without)");
    expect(now.newProduct({ mode: "quote" })).toContain("Save and add to quote");
    expect(now.newProduct({ mode: "library" })).toContain("Save to my library");
    const saving = tag(now.newProduct({ saving: true }), 'data-testid="barcode-new-save"');
    expect(saving).toContain('aria-busy="true"');
    expect(now.newProduct({ saving: true })).toContain("Saving…");
    expect(now.newProduct()).not.toContain("already in my library");
    expect(now.newProduct({ library: [sika] })).toContain("already in my library");
    expect(now.newProduct(clash)).toContain("Add barcode to Pine 90x45");
  });

  it("library picker: plain words when there's nothing to pick", () => {
    expect(picker([])).toContain("Your library is empty.");
    expect(picker([sika, pine])).toContain("No price saved yet");
    expect(picker([sika], true)).toMatch(/<button[^>]*disabled=""/);
  });

  it("saved: what happened, and in a quote that it was added", () => {
    expect(now.saved("library")).toContain("Saved to your library");
    expect(now.saved("library", false, true)).toContain("Barcode saved");
    expect(now.saved("quote")).toContain("Added to your quote");
    expect(now.saved("library", true, true)).toContain("Its old barcode was replaced.");
    expect(now.saved("library")).not.toContain("replaced");
  });

  it("the sheet: the kit's bottom sheet, titled and closable as before, the photo input inside it", () => {
    const markup = sheet("library");
    expect(markup).toMatch(/^<dialog /);
    expect(tag(markup, "<dialog")).toContain("aria-labelledby=");
    expect(markup).toMatch(/<h2 [^>]*>Scan barcode<\/h2>/);
    expect(markup).toMatch(/<button[^>]*aria-label="Close scanner"/);
    // Node has no navigator.mediaDevices, the same as an insecure page.
    expect(markup).toContain('data-camera="unavailable"');
    const photo = markup.indexOf('data-testid="barcode-photo-input"');
    expect(photo).toBeGreaterThan(0);
    expect(photo).toBeLessThan(markup.lastIndexOf("</dialog>"));
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  });
});

describe("the Scan barcode button", () => {
  it("classic by default, exactly as before", () => {
    const markup = trigger();
    expect(tag(markup, 'data-testid="scan-barcode-button"')).toContain('class="t2q-btn-ghost-pro"');
    expect(markup).toContain('width="20"');
  });

  it("new look: the caller's kit classes, or the kit's secondary button without them", () => {
    const given = buttonClasses({ variant: "secondary", fullWidth: true });
    expect(tag(trigger({ look: "new", className: given }), 'data-testid="scan-barcode-button"')).toContain(
      `class="${given}"`,
    );
    const own = tag(trigger({ look: "new" }), 'data-testid="scan-barcode-button"');
    expect(own).toContain(`class="${buttonClasses({ variant: "secondary" })}"`);
    expect(own).toContain('aria-haspopup="dialog"');
  });

  it("new look: while the scanner loads, a plain status on the page's own surface", () => {
    const markup = html(createElement(OpeningScanner, { look: "new" }));
    expect(markup).toMatch(/role="status"[\s\S]*Opening the scanner…/);
    expect(markup).toContain("bg-ui-surface");
    expect(html(createElement(OpeningScanner, { look: "classic" }))).toContain("bg-black/70");
  });
});
