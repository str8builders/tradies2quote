import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer } from "./Footer";
import { JobSiteStory } from "../jobsite/JobSiteStory";

// The footer is shared by 7 pages (the homepage, /classic, /install,
// /calculator, /privacy, /terms, /support). Its "How it works" and
// "Features" links used to point at #demo-reel and #features, sections the
// 3D job-site homepage doesn't have — the anchors silently did nothing.
describe("Footer — product links land on real homepage sections", () => {
  const html = renderToStaticMarkup(<Footer />);

  /** The href of the <a> carrying this data-testid, whatever order next/link renders its attributes in. */
  function hrefFor(testid: string): string | null {
    const tag = html.match(new RegExp(`<a[^>]*data-testid="${testid}"[^>]*>`))?.[0];
    return tag?.match(/href="([^"]*)"/)?.[1] ?? null;
  }

  it("\"How it works\" and \"Features\" point at real anchors, not the old landing's ids", () => {
    expect(hrefFor("footer-link-how")).toBe("/#talk");
    expect(hrefFor("footer-link-features")).toBe("/#request");
    expect(html).not.toContain("#demo-reel");
    expect(html).not.toContain('href="/#features"');
  });

  it("every #-anchor the footer links to exists on the current homepage", () => {
    const story = renderToStaticMarkup(<JobSiteStory nativeShell={false} />);
    const anchors = [...html.matchAll(/href="\/#([a-z-]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const id of anchors) {
      expect(story, `#${id} should exist on the homepage`).toContain(`id="${id}"`);
    }
  });
});
