// "What you said" (the transcript panel) in both looks. The classic snapshot
// was taken from the untouched component, before the new look was added, so
// the classic page provably renders exactly as it did.
// Regenerate only after an intended change to the old look:
// npx vitest run <this file> --update

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { CleanedCard, TranscriptPanel, regenerateWarning, type TranscriptPanelData } from "./TranscriptPanel";
import * as V2 from "./TranscriptPanelV2";

const noop = () => undefined;

const TRANSCRIPT: TranscriptPanelData = {
  raw: "build a 6 by 4 deck in h3 pine and jib the garage wall",
  cleaned: "Build a 6 × 4 m deck in H3.2 pine and GIB the garage wall.",
  summary: {
    job_type: "Deck",
    site_or_client: null,
    dimensions: "6 × 4 m",
    surface_context: "Ground level",
    exposure_context: null,
    material_assumptions: ["H3.2 treated pine framing"],
    missing_information: ["Deck height above the ground"],
    compliance_risks: ["Over 1.5 m high needs a barrier"],
    confidence: 0.82,
  },
  corrections: [
    { before: "h3", after: "H3.2", type: "treatment_class", index: 25 },
    { before: "jib", after: "GIB", type: "brand_plasterboard", index: 37, contextual: true },
  ],
  clarification_questions: [
    { id: "transcript.height", question: "How high is the deck?", why: "Over 1.5 m it needs a barrier.", phrase: "deck" },
  ],
  confidence: 0.82,
  fallback: "summary_failed",
};

/** Just what was said: no summary, nothing corrected or unclear. */
const PLAIN: TranscriptPanelData = {
  raw: "paint the fence",
  cleaned: "Paint the fence.",
  summary: null,
  corrections: [],
  clarification_questions: [],
  confidence: 0.5,
};

/** The new look's card props: the classic ones, with the warning always given (as the panel does). */
type CardProps = ComponentProps<typeof V2.CleanedCard>;
const CARD: CardProps = {
  text: TRANSCRIPT.cleaned,
  editing: false,
  pending: null,
  correctionsCount: 2,
  clarificationsCount: 1,
  onTextChange: noop,
  onCopy: noop,
  copied: false,
  onEdit: noop,
  onCancel: noop,
  onSave: noop,
  onRegenerate: noop,
  onAskRegenerate: noop,
  onCancelRegenerate: noop,
  regenWarning: regenerateWarning(3),
};

/** Every cleaned-card state the tradie can reach. */
const CARD_STATES: Array<[string, Partial<CardProps>]> = [
  ["reading", {}],
  ["copied", { copied: true }],
  ["editing", { editing: true }],
  ["editing, nothing typed", { editing: true, text: "  " }],
  ["asking before regenerating", { editing: true, confirmingRegen: true }],
  ["saving", { editing: true, pending: "save" }],
  ["regenerating", { editing: true, pending: "regen" }],
  ["editing a sent quote", { editing: true, canRegenerate: false }],
  ["accepted, read only", { readOnly: true, canRegenerate: false }],
];

type Look = "classic" | "new";
const panel = (transcript: TranscriptPanelData, status?: ComponentProps<typeof TranscriptPanel>["status"], look?: Look) =>
  renderToStaticMarkup(<TranscriptPanel quoteId="q-1" transcript={transcript} status={status} lineCount={3} look={look} />);
const classicCard = (patch: Partial<CardProps>) => renderToStaticMarkup(<CleanedCard {...CARD} {...patch} />);
const newCard = (patch: Partial<CardProps>) => renderToStaticMarkup(<V2.CleanedCard {...CARD} {...patch} />);

describe("TranscriptPanel (classic) renders exactly as before", () => {
  it("the panel and every cleaned-card state", async () => {
    const out = [
      ["panel: a draft with everything", panel(TRANSCRIPT)],
      ["panel: accepted, plain", panel(PLAIN, "accepted")],
      ...CARD_STATES.map(([name, patch]) => [`cleaned card: ${name}`, classicCard(patch)]),
    ]
      .map(([name, markup]) => `<!-- ${name} -->\n${markup}\n`)
      .join("\n");
    await expect(out).toMatchFileSnapshot("./__snapshots__/TranscriptPanel.classic.html");
  });

  it("is the default look", () => {
    expect(panel(TRANSCRIPT, "draft", "classic")).toBe(panel(TRANSCRIPT, "draft"));
  });
});

const testIds = (markup: string) => [...markup.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
const roles = (markup: string) => [...markup.matchAll(/\brole="([^"]+)"/g)].map((m) => m[1]);
/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

/** The same state in both looks: [name, classic markup, new-look markup]. */
const PAIRS: Array<[string, string, string]> = [
  ["panel: a draft with everything", panel(TRANSCRIPT), panel(TRANSCRIPT, "draft", "new")],
  ["panel: accepted, plain", panel(PLAIN, "accepted"), panel(PLAIN, "accepted", "new")],
  ...CARD_STATES.map(([name, patch]): [string, string, string] => [`cleaned card: ${name}`, classicCard(patch), newCard(patch)]),
];

describe("TranscriptPanel in the new look", () => {
  it.each(PAIRS)("%s: follows the design rules", (_name, _classic, markup) => {
    expect(markupRuleBreaks(markup)).toEqual([]);
    for (const old of ["t2q-", "font-mono", "bg-ink", "text-ink", "border-ink", "text-white", "hivis", "red-", "// "]) {
      expect(markup).not.toContain(old);
    }
  });

  it("and so does its source", () => {
    const path = join(process.cwd(), "src/app/app/quotes/preview/[id]/_components/TranscriptPanelV2.tsx");
    expect(sourceRuleBreaks(readFileSync(path, "utf8"))).toEqual([]);
  });

  it.each(PAIRS)("%s: the same test ids and roles as the classic look", (_name, classic, markup) => {
    expect(testIds(markup)).toEqual(testIds(classic));
    expect(roles(markup)).toEqual(roles(classic));
  });

  it.each(PAIRS)("%s: every button is a big thumb target", (_name, _classic, markup) => {
    for (const button of markup.match(/<button[^>]*>/g) ?? []) {
      // 48 px, or the kit's small 40 px button with its 48 px tap area.
      expect(button).toMatch(/min-h-12|min-h-10 [^"]*after:-inset-1/);
    }
    for (const summary of markup.match(/<summary[^>]*>/g) ?? []) expect(summary).toContain("min-h-12");
  });

  it("a draft: what was said, what T2Q made of it, and the warning when the rules did it alone", () => {
    const markup = panel(TRANSCRIPT, "draft", "new");
    expect(markup).toMatch(/^<section data-testid="transcript-panel" class="space-y-3">/);
    expect(markup).toMatch(/data-testid="transcript-ai-fallback-pill"[\s\S]*data-tone="warn"[\s\S]*T2Q skipped · rules only/);
    for (const text of ["You said", "T2Q cleaned it to", "T2Q understood", "82% confident", "2 corrections", "1 unclear phrase", "How high is the deck?"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain("Missing information");
    expect(markup).toMatch(/<ul class="[^"]*text-ui-warn"><li>Deck height above the ground<\/li>/);
    expect(markup).toMatch(/<ul class="[^"]*text-ui-bad"><li>Over 1.5 m high needs a barrier<\/li>/);
    // Each corrections caret turns with its own <details>, not the tool around it.
    expect(markup).toContain("group-open/fixes:rotate-180");
    expect(markup).not.toMatch(/\bgroup-open:/);
    expect(panel(PLAIN, "draft", "new")).not.toContain("transcript-ai-fallback-pill");
  });

  it("copies with a plain Copy, and says Copied", () => {
    expect(tag(newCard({}), 'aria-label="Copy cleaned transcript"')).toContain("after:-inset-1");
    expect(newCard({})).toContain(">Copy<");
    expect(newCard({ copied: true })).toContain(">Copied<");
    expect(newCard({ editing: true })).not.toContain("Copy cleaned transcript");
  });

  it("edits in a kit text box, and saves or regenerates with the kit's loading buttons", () => {
    const editing = newCard({ editing: true });
    const box = tag(editing, 'data-testid="transcript-cleaned-textarea"');
    expect(box).toMatch(/^<textarea/);
    expect(box).toContain("ui-input-reset");
    expect(box).toContain('aria-label="Cleaned transcript"');
    expect(tag(newCard({ editing: true, text: "  " }), 'data-testid="transcript-save"')).toContain('disabled=""');
    const saving = newCard({ editing: true, pending: "save" });
    expect(tag(saving, 'data-testid="transcript-save"')).toContain('aria-busy="true"');
    expect(saving).toContain("Saving…");
    expect(saving).toMatch(/animate-spin [^"]*motion-reduce:animate-spin-calm/);
    expect(tag(saving, 'data-testid="transcript-cancel"')).toContain('disabled=""');
    const regenerating = newCard({ editing: true, pending: "regen" });
    expect(tag(regenerating, 'data-testid="transcript-regenerate"')).toContain('aria-busy="true"');
    expect(regenerating).toContain("Regenerating…");
  });

  it("asks before replacing the lines, and keeps Regenerate for drafts", () => {
    const asking = newCard({ editing: true, confirmingRegen: true });
    expect(tag(asking, 'data-testid="transcript-regenerate-confirm"')).toContain('role="alertdialog"');
    expect(asking).toContain("Regenerating replaces all 3 current lines and the total");
    expect(tag(asking, 'data-testid="transcript-regenerate-confirm-yes"')).toContain('data-variant="danger"');
    expect(asking).toContain("Keep current quote");
    expect(tag(asking, 'data-testid="transcript-regenerate"')).toContain('disabled=""');
    const sent = newCard({ editing: true, canRegenerate: false });
    expect(sent).not.toContain('data-testid="transcript-regenerate"');
    expect(sent).toContain("Regenerate is for drafts only");
  });

  it("is read only once the quote is accepted", () => {
    const markup = panel(PLAIN, "accepted", "new");
    expect(markup).not.toContain('data-testid="transcript-edit"');
    expect(markup).toContain("transcript is read-only");
  });
});
