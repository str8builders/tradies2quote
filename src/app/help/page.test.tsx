import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));

import HelpPage, { generateMetadata } from "./page";

describe("/help — landmark and title", () => {
  it("has exactly one <main>, wrapping the whole page", async () => {
    const html = renderToStaticMarkup(await HelpPage());
    expect(html.match(/<main[\s>]/g)).toHaveLength(1);
    expect(html.match(/<\/main>/g)).toHaveLength(1);
    // Content from both the very top and the very bottom of the page is inside it.
    const mainOpenAt = html.indexOf("<main");
    const mainCloseAt = html.lastIndexOf("</main>");
    expect(html.indexOf("Need a hand?")).toBeGreaterThan(mainOpenAt);
    expect(html.indexOf("Back to the app")).toBeLessThan(mainCloseAt);
  });

  it("titles the page once, not doubled up with the site brand", async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toEqual({ absolute: "Help & FAQ — Tradies2Quote" });
  });
});
