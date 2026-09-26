// People should know the photo, top left, is where settings live.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../settings/new-look-actions", () => ({ setNewLookAction: vi.fn() }));

import { TOP_BAR_FIXTURE } from "../lib/fixtures";
import { AccountButton } from "./AccountButton";
import { SettingsTipView } from "./SettingsTip";

describe("the photo menu is easy to find", () => {
  it("the photo carries a small gear badge and says what it opens", () => {
    const out = renderToStaticMarkup(<AccountButton data={TOP_BAR_FIXTURE} />);
    expect(out).toContain('aria-label="Your account and settings"');
    expect(out).toContain('data-testid="account-settings-badge"');
  });

  it("the Home tip says where settings are, with Show me and Got it", () => {
    const out = renderToStaticMarkup(<SettingsTipView onShow={() => {}} onDismiss={() => {}} />);
    expect(out).toContain("Your settings, business details and more are behind your photo.");
    expect(out).toContain("Show me");
    expect(out).toContain("Got it");
    expect(out).toContain('role="note"');
  });
});
