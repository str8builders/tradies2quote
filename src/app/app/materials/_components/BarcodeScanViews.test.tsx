import { createElement, createRef, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../barcode-actions", () => ({ lookupBarcodeAction: vi.fn(), saveBarcodeMaterialAction: vi.fn() }));

import {
  CameraStep,
  ErrorStep,
  FoundStep,
  NewProductStep,
  SavedStep,
  TypeNumberStep,
  type CameraStatus,
} from "./BarcodeScanViews";
import { BarcodeScanSheet } from "./BarcodeScanSheet";

const noop = () => undefined;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const sika = { id: "m1", name: "Sikaflex 11FC grey", unit: "each", default_unit_price: 14.35, category: null };

const camera = (status: CameraStatus, hint: string | null = null) =>
  html(
    createElement(CameraStep, {
      status,
      hint,
      videoRef: createRef<HTMLVideoElement>(),
      viewRef: createRef<HTMLDivElement>(),
      onRetry: noop,
      onTakePhoto: noop,
      onTypeNumber: noop,
    }),
  );

/** Every button is a big thumb target: 48px pills or 56px primaries. */
function expectBigButtons(markup: string) {
  const buttons = markup.match(/<button[^>]*>/g) ?? [];
  expect(buttons.length).toBeGreaterThan(0);
  for (const b of buttons) expect(b).toMatch(/!min-h-1[24]|min-h-14|h-12/);
}

describe("CameraStep", () => {
  it("shows the live camera the way WKWebView needs it: inline, muted, autoplaying", () => {
    const markup = camera("live");
    expect(markup).toMatch(/<video[^>]*playsinline=""[^>]*muted=""[^>]*autoplay=""/i);
    expect(markup).toContain("Point the camera at the barcode");
    expectBigButtons(markup);
  });

  it("always offers the photo and typing fallbacks", () => {
    for (const status of ["starting", "live", "paused", "denied", "busy", "unavailable", "error", "reader"] as const) {
      const markup = camera(status);
      expect(markup).toContain("Take a photo of the barcode");
      expect(markup).toContain("Type the number instead");
    }
  });

  it("explains a blocked camera in one plain sentence with what to do", () => {
    const markup = camera("denied");
    expect(markup).not.toContain("<video");
    expect(markup).toMatch(/role="alert"[^>]*>Camera access is turned off for Tradies2Quote/);
    expect(markup).toContain("then tap Try again.");
    expect(markup).toContain("Try again");
    expect(markup).not.toMatch(/NotAllowedError|getUserMedia/);
  });

  it("does not offer Try again when there is no camera at all", () => {
    const markup = camera("unavailable");
    expect(markup).toContain("Take a photo of the barcode or type the number instead.");
    expect(markup).not.toContain(">Try again<");
  });

  it("shows why a read was skipped", () => {
    expect(camera("live", "That code is too short to be a product barcode.")).toContain("too short");
  });

  it("offers to start the camera again after a pause", () => {
    expect(camera("paused")).toContain("Start the camera");
  });

  it("keeps the scan line still for people who prefer reduced motion", () => {
    expect(camera("live")).toContain("motion-safe:animate-pulse");
    expect(camera("live")).not.toMatch(/class="[^"]*(?<!motion-safe:)animate-pulse/);
  });
});

describe("TypeNumberStep", () => {
  it("opens the number keypad", () => {
    const markup = html(createElement(TypeNumberStep, { error: null, onSubmit: noop, onUseCamera: noop }));
    expect(markup).toMatch(/inputmode="numeric"/i);
    expectBigButtons(markup);
  });

  it("shows a typo in plain words", () => {
    const markup = html(
      createElement(TypeNumberStep, { error: "Those numbers don't add up to a real barcode.", onSubmit: noop, onUseCamera: noop }),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("don&#x27;t add up");
  });
});

describe("FoundStep", () => {
  const found = (mode: "library" | "quote", added = false) =>
    html(
      createElement(FoundStep, {
        mode,
        material: sika,
        code: "4006381333931",
        currency: "NZD",
        added,
        onAddToQuote: noop,
        onOpen: noop,
        onScanAnother: noop,
        onDone: noop,
      }),
    );

  it("shows the product and the tradie's price, with one big Add to quote", () => {
    const markup = found("quote");
    expect(markup).toContain("Sikaflex 11FC grey");
    expect(markup).toContain("$14.35 / each");
    expect(markup).toContain('data-testid="barcode-add-to-quote"');
    expect(markup).not.toContain('data-testid="barcode-open-material"');
    expect(markup).toContain("Scan another");
    expectBigButtons(markup);
  });

  it("opens the item from the library page", () => {
    const markup = found("library");
    expect(markup).toContain('data-testid="barcode-open-material"');
    expect(markup).not.toContain('data-testid="barcode-add-to-quote"');
  });

  it("confirms the line was added and offers the next scan", () => {
    const markup = found("quote", true);
    expect(markup).toContain("Added as 1 each");
    expect(markup).toContain("Scan another");
    expect(markup).toContain("Done");
    expect(markup).not.toContain('data-testid="barcode-add-to-quote"');
  });

  it("never shows a missing price as $0", () => {
    const markup = html(
      createElement(FoundStep, {
        mode: "quote",
        material: { ...sika, default_unit_price: null },
        code: "4006381333931",
        currency: "NZD",
        added: false,
        onAddToQuote: noop,
        onOpen: noop,
        onScanAnother: noop,
        onDone: noop,
      }),
    );
    expect(markup).toContain("No price saved yet");
    expect(markup).not.toContain("$0.00");
  });
});

describe("NewProductStep", () => {
  const form = (over: Partial<Parameters<typeof NewProductStep>[0]> = {}) =>
    html(
      createElement(NewProductStep, {
        mode: "quote",
        code: "4006381333931",
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
    );

  it("asks what it is with three big fields", () => {
    const markup = form();
    expect(markup).toContain("What is this?");
    expect(markup).toContain('data-testid="barcode-new-name"');
    expect(markup).toContain('data-testid="barcode-new-unit"');
    expect(markup).toMatch(/data-testid="barcode-new-price"/);
    expect(markup).toMatch(/inputmode="decimal"/i);
    const units = [...markup.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    expect(units).toEqual(["each", "m", "m²", "box", "bag", "sheet", "L", "kg", "roll", "pack"]);
    expect(markup).toContain("4006381333931");
    expectBigButtons(markup);
  });

  it("says where the save goes", () => {
    expect(form({ mode: "quote" })).toContain("Save and add to quote");
    expect(form({ mode: "library" })).toContain("Save to my library");
    expect(form({ saving: true })).toContain("Saving…");
  });

  it("offers the tradie's own library only when there is one", () => {
    expect(form()).not.toContain("already in my library");
    expect(form({ library: [sika] })).toContain("already in my library");
  });

  it("turns a name clash into a one-tap attach", () => {
    const markup = form({
      error: 'You already have "Pine 90x45" in your library. Add this barcode to it instead?',
      conflict: { kind: "name", id: "p1", name: "Pine 90x45" },
    });
    expect(markup).toContain("Add this barcode to it instead?");
    expect(markup).toContain('data-testid="barcode-attach-conflict"');
    expect(markup).toContain("Add barcode to Pine 90x45");
  });
});

describe("SavedStep", () => {
  const saved = (mode: "library" | "quote", replaced = false, attached = false) =>
    html(
      createElement(SavedStep, {
        mode,
        material: sika,
        currency: "NZD",
        attached,
        replaced,
        onOpen: noop,
        onScanAnother: noop,
        onDone: noop,
      }),
    );

  it("confirms the save, and in a quote that it was added", () => {
    expect(saved("library")).toContain("Saved to your library");
    expect(saved("quote")).toContain("added to your quote");
    expect(saved("library", false, true)).toContain("Barcode saved");
    expectBigButtons(saved("library"));
  });

  it("says when an old barcode was replaced", () => {
    expect(saved("library", true, true)).toContain("Its old barcode was replaced.");
    expect(saved("library")).not.toContain("replaced");
  });
});

describe("ErrorStep", () => {
  it("shows the message and a way forward", () => {
    const markup = html(
      createElement(ErrorStep, {
        message: "We couldn't check that barcode. Check your connection and try again.",
        retryLabel: "Try again",
        onRetry: noop,
        onTypeNumber: noop,
      }),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Check your connection");
    expect(markup).toContain("Type the number instead");
    expectBigButtons(markup);
  });
});

describe("BarcodeScanSheet", () => {
  it("is a labelled modal dialog with a big Close button", () => {
    const markup = html(createElement(BarcodeScanSheet, { mode: "quote", currency: "NZD", onClose: noop }));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(markup).toContain(`id="${labelledBy}"`);
    expect(markup).toContain("Scan barcode");
    expect(markup).toMatch(/<button[^>]*aria-label="Close scanner"[^>]*class="[^"]*h-12 w-12/);
    expect(markup).toContain("t2q-sheet-panel");
  });

  it("goes straight to the photo and typing fallbacks where there is no camera API", () => {
    // Node has no navigator.mediaDevices — the same as an insecure page.
    const markup = html(createElement(BarcodeScanSheet, { mode: "library", currency: "NZD", onClose: noop }));
    expect(markup).toContain('data-camera="unavailable"');
    expect(markup).toContain("Take a photo of the barcode");
    expect(markup).toContain("Type the number instead");
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  });
});
