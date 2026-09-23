import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: vi.fn() }));
import { isNativeShellRequest } from "@/lib/native-shell";
import HomePage from "../../page";
import { Header } from "./Header";
import { Footer } from "./Footer";
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

describe("marketing release contract", () => {
  it("withholds pricing, off-store calculator promotion and priced metadata in the native shell", async () => {
    vi.mocked(isNativeShellRequest).mockResolvedValue(true);
    const tree = elements(await HomePage());
    expect(tree.some(e => e.type === Pricing || e.type === FAQ || e.type === CompanionApp || e.type === "script")).toBe(false);
    expect(tree.find(e => e.type === Header)?.props.hidePricingLinks).toBe(true);
    expect(tree.find(e => e.type === Footer)?.props.hidePricingLinks).toBe(true);
  });
  it("preserves public pricing, calculator and FAQ journeys on the web", async () => {
    vi.mocked(isNativeShellRequest).mockResolvedValue(false);
    const tree = elements(await HomePage());
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
