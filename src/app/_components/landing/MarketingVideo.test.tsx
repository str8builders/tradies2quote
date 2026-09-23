import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The site-wide motion toggle; on the server it reports "paused".
vi.mock("@/app/_components/LiveWallpaper", () => ({ useMotionPaused: () => true }));

import { MarketingVideo } from "./MarketingVideo";
import { DEMO_TIMELINE, HERO_DESCRIPTION } from "@/remotion/demo-script";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("MarketingVideo server render", () => {
  it("renders the demo as a poster box that neither downloads nor autoplays", () => {
    const html = renderToString(createElement(MarketingVideo, { variant: "demo" }));
    expect(html).toContain('preload="none"');
    expect(html).not.toMatch(/autoplay/i);
    // Posters for both shapes; phones get the tall one through <picture>.
    expect(html).toContain('src="/images/marketing/poster-demo-wide.webp"');
    expect(html).toContain('srcSet="/images/marketing/poster-demo-tall.webp"');
    expect(html).toContain('media="(max-width: 767px)"');
    // No video source is chosen until the viewport is known on the client.
    expect(html).not.toMatch(/\/videos\/demo-(wide|tall)\.(mp4|webm)/);
    expect(html).toContain("playsInline");
    expect(html).toContain('data-shape="pending"');
    // Reserved aspect ratio: tall below md, 16:9 from md up.
    expect(html).toContain("aspect-[9/16]");
    expect(html).toContain("md:aspect-video");
    // Accessible name plus a hidden transcript built from the burned-in captions.
    expect(html).toMatch(/aria-label="Tradies2Quote walkthrough[^"]*"/);
    expect(html).toContain('aria-describedby="');
    for (const caption of DEMO_TIMELINE.captions) expect(html).toContain(escapeHtml(caption.text));
    // Controls appear only after mount, so the first paint never flashes them.
    expect(html).not.toContain("Play video");
    expect(html).not.toContain("Pause video");
  });

  it("renders the hero portrait poster eagerly, still without sources or autoplay", () => {
    const html = renderToString(createElement(MarketingVideo, { variant: "hero" }));
    expect(html).toContain('preload="none"');
    expect(html).not.toMatch(/autoplay/i);
    expect(html).toContain('src="/images/marketing/poster-hero.webp"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain("aspect-[1/2]");
    expect(html).not.toContain("/videos/hero-loop");
    expect(html).toContain(escapeHtml(HERO_DESCRIPTION));
  });
});
