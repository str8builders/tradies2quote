import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));
// The form only needs the action references; keep the server code out.
vi.mock("../actions", () => ({
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
}));

import { MaterialForm } from "./MaterialForm";

describe("MaterialForm — manual price entry and GST", () => {
  const html = renderToStaticMarkup(createElement(MaterialForm, { mode: "create" }));

  it("offers a single 'price includes GST' checkbox, unticked (ex-GST) by default", () => {
    const box = html.match(/<input[^>]*name="price_includes_gst"[^>]*>/)?.[0] ?? "";
    expect(box).toContain('type="checkbox"');
    expect(box).not.toContain("checked");
    expect(html).toContain("This price includes GST — save it ex-GST");
    expect(html).toContain("Default price (ex GST)");
  });

  it("accepts sub-cent prices (a stored 0.043478 must stay editable)", () => {
    const price = html.match(/<input[^>]*name="default_unit_price"[^>]*>/)?.[0] ?? "";
    expect(price).toContain('step="any"');
  });
});
