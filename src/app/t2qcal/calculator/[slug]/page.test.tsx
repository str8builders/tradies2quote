import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getTool } from "@/t2qcal/lib/tools";
import CalculatorPage, { generateMetadata } from "./page";

const SLUG = "common-rafter";
const tool = getTool(SLUG)!;

describe("T2QCAL calculator page — per-calculator metadata", () => {
  it("titles and describes the page from the tool, bypassing the site-wide brand template", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) });
    expect(metadata.title).toEqual({ absolute: `${tool.name} — T2QCAL` });
    expect(metadata.description).toBe(tool.summary);
    expect(metadata.alternates).toEqual({ canonical: `/t2qcal/calculator/${SLUG}` });
  });

  it("every calculator gets its own distinct title and canonical (not one shared page)", async () => {
    const a = await generateMetadata({ params: Promise.resolve({ slug: "common-rafter" }) });
    const b = await generateMetadata({ params: Promise.resolve({ slug: "straight-stairs" }) });
    expect(a.title).not.toEqual(b.title);
    expect(a.alternates?.canonical).not.toBe(b.alternates?.canonical);
  });

  it("returns empty metadata for an unknown slug (page itself 404s)", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "not-a-real-tool" }) });
    expect(metadata).toEqual({});
  });
});

describe("T2QCAL calculator page — server-rendered heading", () => {
  it("renders the tool's name and summary in the initial HTML, before the client workspace resolves", async () => {
    const el = await CalculatorPage({
      params: Promise.resolve({ slug: SLUG }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(el);

    expect(html).toContain(`<h1>${tool.name}</h1>`);
    expect(html).toContain(tool.summary);
    // Present alongside, not instead of, the client workspace's own initial state.
    expect(html).toContain("Restoring your working");

    const headingAt = html.indexOf(tool.name);
    const restoringAt = html.indexOf("Restoring your working");
    expect(headingAt).toBeGreaterThan(0);
    expect(headingAt).toBeLessThan(restoringAt);
  });
});
