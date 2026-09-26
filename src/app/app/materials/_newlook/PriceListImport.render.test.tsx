// "Import a price list" (new look), first paint rendered in node: one file
// picker that takes every kind of price list, and the camera for printed ones.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import { PriceImportScreen } from "./PriceImportScreen";

const html = renderToStaticMarkup(
  createElement(PriceImportScreen, { taxRate: 0.15, taxLabel: "GST", currency: "NZD", needsAiConsent: false }),
);

describe("PriceImportScreen", () => {
  it("has the title and a way back to Prices", () => {
    expect(html).toContain("Import a price list");
    expect(html).toContain('href="/app/materials"');
  });

  const input = (testId: string) => html.match(new RegExp(`<input[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? "";

  it("takes CSV / TXT, Excel, PDF and photos in one picker", () => {
    const accept = input("price-import-file").match(/accept="([^"]*)"/)?.[1] ?? "";
    for (const kind of [".csv", ".txt", ".xlsx", ".pdf", "image/*", ".heic"]) expect(accept).toContain(kind);
    expect(input("price-import-file")).toContain("multiple");
  });

  it("offers the camera for a printed list", () => {
    expect(input("price-import-camera")).toContain('capture="environment"');
    expect(html).toContain("Take photos of a printed list");
  });

  it("shows no consent step until the AI is actually needed", () => {
    expect(html).not.toContain('data-testid="ai-consent-modal"');
  });
});
