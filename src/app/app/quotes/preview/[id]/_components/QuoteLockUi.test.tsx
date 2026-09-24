import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CleanedCard, regenerateWarning } from "./TranscriptPanel";
import { StickyActionBar } from "./StickyActionBar";
import type { QuoteStatus } from "@/lib/quote-types";

const noop = () => undefined;
function card(props: Partial<ComponentProps<typeof CleanedCard>>) {
  return renderToStaticMarkup(
    createElement(CleanedCard, {
      text: "Build a 6 by 4 deck",
      editing: true,
      pending: null,
      correctionsCount: 0,
      clarificationsCount: 0,
      onTextChange: noop,
      onCopy: noop,
      copied: false,
      onEdit: noop,
      onCancel: noop,
      onSave: noop,
      onRegenerate: noop,
      ...props,
    }),
  );
}

describe("transcript regenerate — drafts only, with a confirm step", () => {
  it("offers Regenerate on a draft", () => {
    expect(card({ canRegenerate: true })).toContain('data-testid="transcript-regenerate"');
  });

  it("hides Regenerate for a sent quote and says why", () => {
    const html = card({ canRegenerate: false });
    expect(html).not.toContain('data-testid="transcript-regenerate"');
    expect(html).toContain("Regenerate is for drafts only");
  });

  it("asks before replacing the lines", () => {
    const html = card({ canRegenerate: true, confirmingRegen: true, regenWarning: regenerateWarning(3) });
    expect(html).toContain('data-testid="transcript-regenerate-confirm"');
    expect(html).toContain("Regenerating replaces all 3 current lines and the total");
    expect(html).toContain("Replace the lines");
    expect(html).toContain("Keep current quote");
  });

  it("is read-only once the quote is accepted", () => {
    const html = card({ editing: false, readOnly: true, canRegenerate: false });
    expect(html).not.toContain('data-testid="transcript-edit"');
    expect(html).toContain("transcript is read-only");
  });

  it("words the warning for one line", () => {
    expect(regenerateWarning(1)).toContain("all 1 current line and");
    expect(regenerateWarning()).toContain("all current lines");
  });
});

function saveButton(status: QuoteStatus) {
  const html = renderToStaticMarkup(
    createElement(StickyActionBar, {
      quoteId: "quote-1",
      status,
      isPending: false,
      onSave: noop,
      onSaveBeforeSend: async () => true,
    }),
  );
  return html.match(/<button[^>]*data-testid="sticky-save-changes"[^>]*>/)?.[0] ?? "";
}

describe("sticky Save button", () => {
  it.each(["accepted", "scheduled", "in_progress", "completed"] as const)("is disabled for a %s quote", (status) => {
    expect(saveButton(status)).toContain(' disabled=""');
    expect(saveButton(status)).toContain("Quote already accepted.");
  });

  it.each(["draft", "sent", "viewed"] as const)("is enabled for a %s quote", (status) => {
    expect(saveButton(status)).not.toContain(' disabled=""');
  });
});
