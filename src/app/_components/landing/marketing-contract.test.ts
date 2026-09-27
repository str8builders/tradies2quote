import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: vi.fn() }));
import { isNativeShellRequest } from "@/lib/native-shell";
import HomePage, { metadata as homeMetadata } from "../../page";
import ClassicHomePage, { metadata as classicMetadata } from "../../classic/page";
import SitePreviewPage from "../../site-preview/page";
import { JobSiteStory } from "../jobsite/JobSiteStory";
import { Pricing } from "./Pricing";
import { FAQ } from "./FAQ";
import { CompanionApp } from "./CompanionApp";
import { faqPageLd, softwareApplicationLd } from "./structured-data";
import { FAQS } from "./FAQ";

type ElementProps = { children?: unknown; hidePricingLinks?: boolean; dangerouslySetInnerHTML?: { __html: string } };
function elements(node: unknown): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

describe("the homepage: the 3D job-site website", () => {
  it("never renders in the native shell: the app goes straight to /app, so no trial, pricing or calculator HTML reaches it", async () => {
    vi.mocked(isNativeShellRequest).mockResolvedValue(true);
    const thrown = await HomePage().then(() => null, (e: unknown) => e as { digest?: string; message?: string });
    expect(thrown?.message).toBe("NEXT_REDIRECT");
    expect(thrown?.digest).toContain(";/app;");
  });

  it("on the web it is the job-site story, with its pricing and FAQ (the website version, never the shell's)", async () => {
    vi.mocked(isNativeShellRequest).mockResolvedValue(false);
    const story = elements(await HomePage()).find((e) => e.type === JobSiteStory);
    expect(story?.props).toMatchObject({ nativeShell: false });
  });

  it("is the canonical, indexed page", () => {
    expect(homeMetadata.alternates?.canonical).toBe("/");
    expect(homeMetadata.robots).toBeUndefined();
  });

  it("old /site-preview links land on it for good (308)", () => {
    let thrown: { digest?: string } | null = null;
    try {
      SitePreviewPage();
    } catch (e) {
      thrown = e as { digest?: string };
    }
    expect(thrown?.digest).toMatch(/^NEXT_REDIRECT;replace;\/;308;/);
  });
});

describe("the previous homepage, kept at /classic", () => {
  it("is not indexed, and points search engines at the homepage", () => {
    expect(classicMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(classicMetadata.alternates?.canonical).toBe("/");
  });

  it("never renders in the native shell either", async () => {
    vi.mocked(isNativeShellRequest).mockResolvedValue(true);
    const thrown = await ClassicHomePage().then(() => null, (e: unknown) => e as { digest?: string; message?: string });
    expect(thrown?.digest).toContain(";/app;");
  });

  it("preserves public pricing, calculator and FAQ journeys on the web", async () => {
    vi.mocked(isNativeShellRequest).mockResolvedValue(false);
    const tree = elements(await ClassicHomePage());
    for (const component of [Pricing, FAQ, CompanionApp]) {
      expect(tree.some(e => e.type === component)).toBe(true);
    }
    const scripts = tree.filter(e => e.type === "script").map(e => JSON.parse(e.props.dangerouslySetInnerHTML!.__html));
    expect(scripts[0]).toEqual(softwareApplicationLd);
    expect(scripts[1]).toEqual(faqPageLd(FAQS));
    expect(scripts[1].mainEntity).toHaveLength(FAQS.length);
  });
  it("offers only the available Solo plan, at the visible NZD price", () => {
    expect(softwareApplicationLd.offers).toHaveLength(1);
    expect(softwareApplicationLd.offers[0]).toMatchObject({ name: "Solo", price: "49", priceCurrency: "NZD" });
  });
});
