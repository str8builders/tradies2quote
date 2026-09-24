import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../new-look-actions", () => ({ setNewLookAction: vi.fn() }));

import { NewLookSetting } from "./NewLookSetting";

const switchTag = (html: string) => /<button[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? "";

describe("Settings: Try the new look (preview)", () => {
  it("follows the default when there is no choice, with no reset button", () => {
    const html = renderToStaticMarkup(<NewLookSetting initialChoice={null} envDefault="off" />);
    expect(html).toContain("Try the new look (preview)");
    expect(switchTag(html)).toContain('aria-checked="false"');
    expect(html).toContain("the default for everyone (current look)");
    expect(html).not.toContain("Go back to the default");
  });

  it("shows an explicit choice and offers the way back to the default", () => {
    const html = renderToStaticMarkup(<NewLookSetting initialChoice envDefault="off" />);
    expect(switchTag(html)).toContain('aria-checked="true"');
    expect(html).toContain("Go back to the default");
    expect(html).toContain('data-testid="settings-new-look"');
  });

  it("an explicit off beats a default of on", () => {
    const html = renderToStaticMarkup(<NewLookSetting initialChoice={false} envDefault="on" />);
    expect(switchTag(html)).toContain('aria-checked="false"');
  });
});
