import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import nativeCatalog from "@/t2qcal/lib/native-catalog.json";
import CalculatorPage, { metadata } from "./page";

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => false }));

const OFFLINE_COUNT = nativeCatalog.resources.filter((r) => r.pdf).length;
const TOTAL = nativeCatalog.resources.length;

// "76 trade manuals … offline" overstated it: 15 of the 76 are web pages
// (e.g. Building Code clauses MBIE won't let anyone save), not downloaded.
describe("/calculator metadata — manuals claim matches the real PDF/web-page split", () => {
  it("names both the total and the offline-readable count, not just the total", () => {
    expect(TOTAL).toBe(76);
    expect(OFFLINE_COUNT).toBeLessThan(TOTAL);
    expect(metadata.description).toContain(`76 trade manuals and standards (${OFFLINE_COUNT} of them readable offline)`);
    expect(metadata.openGraph?.description).toContain(`76 trade manuals and standards (${OFFLINE_COUNT} offline)`);
  });

  it("never claims all 76 read offline", () => {
    expect(metadata.description).not.toMatch(/76 trade manuals and standards that read offline/);
    expect(metadata.openGraph?.description).not.toMatch(/76 trade manuals offline/);
  });

  it("the page body's own count agrees with the metadata (same source of truth)", async () => {
    const html = renderToStaticMarkup(await CalculatorPage());
    expect(html).toContain(`${OFFLINE_COUNT} download directly`);
  });
});
