// Regression guard for the old (current) new-quote flow while the redesign's
// new look is built beside it. The snapshots were taken from the untouched
// component, before the shared rules moved to ../_lib/quote-input.ts, so the
// old flow provably renders exactly as it did. Regenerate only after an
// intended change to the old flow: npx vitest run <this file> --update

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ createDraftQuote: async () => undefined }));
vi.mock("../ai-consent-actions", () => ({ recordAiConsentAction: async () => ({ ok: true }) }));
// Animated parts owned by other screens: stand-ins keep this guard about the
// flow's own markup.
vi.mock("./VoiceWaveform", () => ({
  VoiceWaveform: ({ state }: { state: string }) => createElement("span", { "data-waveform": state }),
}));
vi.mock("@/app/app/_components/TapeMeasureProgress", () => ({ TapeMeasureProgress: () => null }));

import { QuoteInputTabs } from "./QuoteInputTabs";

const render = (props: NonNullable<ComponentProps<typeof QuoteInputTabs>>) =>
  renderToStaticMarkup(<QuoteInputTabs {...props} />);

describe("old new-quote flow (switch off) renders exactly as before", () => {
  it.each([
    ["voice-scan", { voiceEnabled: true, scanEnabled: true }],
    ["type-only", { voiceEnabled: false, scanEnabled: false }],
    ["type-scan", { voiceEnabled: false, scanEnabled: true }],
    ["consent", { voiceEnabled: true, scanEnabled: true, needsAiConsent: true }],
  ] as const)("%s", async (name, props) => {
    await expect(render(props)).toMatchFileSnapshot(`./__snapshots__/QuoteInputTabs.${name}.html`);
  });
});
