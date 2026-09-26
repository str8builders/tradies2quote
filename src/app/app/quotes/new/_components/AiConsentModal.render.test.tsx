// The iOS AI-consent step (App Store 5.1.2(i)) in both looks. The old look's
// overlay is pinned byte for byte by QuoteInputTabs' consent snapshot; the new
// look's bottom sheet must carry the very same disclosure, privacy link and
// two choices, because App Review depends on them.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../ai-consent-actions", () => ({ recordAiConsentAction: async () => ({ ok: true }) }));

import { markupRuleBreaks } from "@/test/design-rules";
import { AiConsentSheet } from "../_v2/AiConsentSheet";
import { AiConsentModal } from "./AiConsentModal";

const noop = () => {};
const modal = (look?: "new" | "old", open = true) =>
  renderToStaticMarkup(createElement(AiConsentModal, { open, onGranted: noop, look }));
const sheet = (patch: Partial<React.ComponentProps<typeof AiConsentSheet>> = {}) =>
  renderToStaticMarkup(
    createElement(AiConsentSheet, { pending: false, error: null, onAccept: noop, onDecline: noop, ...patch }),
  );

/** The words a person sees, one space apart. */
const words = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The disclosure, from its first words to its last. */
function disclosure(html: string): string {
  const text = words(html);
  const start = text.indexOf("To turn what you say");
  const end = text.indexOf("anytime in Settings.");
  expect(start, "disclosure start").toBeGreaterThanOrEqual(0);
  expect(end, "disclosure end").toBeGreaterThan(start);
  return text.slice(start, end + "anytime in Settings.".length);
}

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

describe("AiConsentModal", () => {
  it("renders nothing while closed, in either look", () => {
    expect(modal(undefined, false)).toBe("");
    expect(modal("new", false)).toBe("");
  });

  it("old look (the default): the overlay as before", () => {
    const out = modal();
    expect(out).toBe(modal("old"));
    expect(tag(out, 'data-testid="ai-consent-modal"')).toContain('role="dialog"');
    expect(out).toContain("t2q-btn-primary-pro");
  });

  it("new look: a kit bottom sheet, titled the same, with nothing from the old overlay", () => {
    const out = modal("new");
    expect(out).toMatch(/^<dialog /);
    expect(tag(out, "<dialog")).toContain("aria-labelledby=");
    expect(out).toMatch(/<h2 [^>]*>Tradies2Quote uses AI<\/h2>/);
    expect(out).toContain("Before we start");
    expect(out).toContain('data-testid="ai-consent-modal"');
    for (const old of ["t2q-", "font-mono", "uppercase", "// before we start", "bg-ink", "text-white"]) {
      expect(out).not.toContain(old);
    }
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("new look: the disclosure word for word, naming both AI providers", () => {
    const now = disclosure(modal("new"));
    expect(now).toBe(disclosure(modal("old")));
    expect(now).toContain("Anthropic (Claude)");
    expect(now).toContain("OpenAI");
    expect(now).toContain("don't use it to train their models");
  });

  it("new look: the same privacy link, opening outside the app", () => {
    const link = (html: string) => tag(html, ">Privacy Policy<").replace(/ class="[^"]*"/, "");
    expect(link(modal("new"))).toBe(link(modal("old")));
    expect(link(modal("new"))).toBe('<a href="/privacy" target="_blank" rel="noreferrer noopener">');
  });

  it("new look: the same two choices at the thumb; closing the sheet also means Not now", () => {
    const out = modal("new");
    expect(tag(out, 'data-testid="ai-consent-accept"')).toContain('data-variant="primary"');
    expect(out).toMatch(/data-testid="ai-consent-accept"[^>]*>.*I agree — continue<\/span><\/button>/);
    expect(tag(out, 'data-testid="ai-consent-decline"')).toContain('data-variant="secondary"');
    expect(out).toMatch(/data-testid="ai-consent-decline"[^>]*>.*Not now<\/span><\/button>/);
    expect(tag(out, 'aria-label="Not now"')).toContain("h-12 w-12");
    for (const choice of ["I agree — continue", "Not now"]) expect(modal("old")).toContain(choice);
  });

  it("new look: while saving, the agree button says so and neither choice can be tapped", () => {
    const out = sheet({ pending: true });
    const accept = tag(out, 'data-testid="ai-consent-accept"');
    expect(accept).toContain('aria-busy="true"');
    expect(accept).toContain("disabled");
    expect(out).toContain("Saving…");
    expect(tag(out, 'data-testid="ai-consent-decline"')).toContain("disabled");
  });

  it("new look: a failed save says why, as an alert", () => {
    expect(sheet()).not.toContain('data-testid="ai-consent-error"');
    const out = sheet({ error: "Not signed in." });
    const alert = tag(out, 'data-testid="ai-consent-error"');
    expect(alert).toContain('role="alert"');
    expect(out).toContain('data-tone="bad"');
    expect(out).toContain("Not signed in.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});
