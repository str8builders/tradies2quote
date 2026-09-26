import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: vi.fn() }));
import { isNativeShellRequest } from "@/lib/native-shell";
import HomePage from "../../page";
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
  it("never renders in the native shell: the app goes straight to /app, so no trial, pricing or calculator HTML reaches it", async () => {
    vi.mocked(isNativeShellRequest).mockResolvedValue(true);
    const thrown = await HomePage().then(() => null, (e: unknown) => e as { digest?: string; message?: string });
    expect(thrown?.message).toBe("NEXT_REDIRECT");
    expect(thrown?.digest).toContain(";/app;");
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
