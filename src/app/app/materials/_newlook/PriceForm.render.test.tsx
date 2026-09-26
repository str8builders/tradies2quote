// "Add a price" and "Change price" (new look), rendered to static HTML in
// node: the frame, the same field names and browser checks as the old form
// (so the same server actions accept it), and the two-step delete.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form only needs the action references; keep the server code out.
vi.mock("../actions", () => ({
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
}));

import { MaterialForm } from "../_components/MaterialForm";
import { ADD_PRICE_INTRO, PriceFormScreen } from "./PriceFormScreen";

const SAVED = {
  id: "m1",
  name: "GIB Standard 10mm",
  unit: "sheet",
  default_unit_price: 0.043478,
  supplier: "Mitre 10",
  supplier_url: "https://www.mitre10.co.nz/gib",
  notes: "Trade price",
};

const add = renderToStaticMarkup(createElement(PriceFormScreen, { mode: "create" }));
const edit = renderToStaticMarkup(createElement(PriceFormScreen, { mode: "edit", initial: SAVED }));

/** The opening tag of the first <tag> whose attributes include `name="…"`. */
const field = (html: string, tag: "input" | "textarea", name: string) =>
  html.match(new RegExp(`<${tag}[^>]*name="${name}"[^>]*>`))?.[0] ?? "";

describe("PriceFormScreen: add a price", () => {
  it("has its title and a way back to Prices", () => {
    expect(add).toMatch(/<h1[^>]*>Add a price<\/h1>/);
    expect(add).toContain('href="/app/materials"');
    expect(add).toContain(">Prices<");
    expect(add).toContain(ADD_PRICE_INTRO);
  });

  it("keeps the old form's field names and browser checks", () => {
    expect(field(add, "input", "name")).toContain("required");
    expect(field(add, "input", "unit")).toContain('value="each"');
    const price = field(add, "input", "default_unit_price");
    for (const attr of ['type="number"', 'step="any"', 'min="0"', 'inputMode="decimal"', "required"]) {
      expect(price).toContain(attr);
    }
    expect(field(add, "input", "supplier")).not.toContain("required");
    expect(field(add, "input", "supplier_url")).toContain('type="url"');
    expect(field(add, "textarea", "notes")).not.toBe("");
  });

  it("price includes GST: a switch, off by default, sent as on/off", () => {
    expect(add).toContain("This price includes GST");
    expect(add).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(field(add, "input", "price_includes_gst")).toContain('value="off"');
  });

  it("one big save button and no delete for a new price", () => {
    expect(add).toContain('data-testid="material-submit"');
    expect(add).toContain(">Add to your prices<");
    expect(add).not.toContain("Delete this price");
    expect(add).not.toContain('name="id"');
  });

  it("uses the new look only", () => {
    expect(add).not.toMatch(/t2q-|font-mono|uppercase|bg-ink-|text-white|\/\/ /);
  });
});

describe("PriceFormScreen: change a price", () => {
  it("names the item under the title", () => {
    expect(edit).toMatch(/<h1[^>]*>Change price<\/h1>/);
    expect(edit).toContain("GIB Standard 10mm");
  });

  it("fills in the saved values, sub-cent prices kept", () => {
    expect(field(edit, "input", "id")).toContain('value="m1"');
    expect(field(edit, "input", "name")).toContain('value="GIB Standard 10mm"');
    expect(field(edit, "input", "unit")).toContain('value="sheet"');
    expect(field(edit, "input", "default_unit_price")).toContain('value="0.043478"');
    expect(field(edit, "input", "supplier_url")).toContain('value="https://www.mitre10.co.nz/gib"');
    expect(edit).toContain("Trade price</textarea>");
    expect(edit).toContain(">Save changes<");
  });

  it("delete asks first: the first tap only opens the question", () => {
    expect(edit).toContain('data-testid="material-delete-open"');
    expect(edit).not.toContain('data-testid="material-delete"');
    expect(edit.match(/<input[^>]*name="id"[^>]*>/g)).toHaveLength(2);
  });
});

describe("the old form is unchanged", () => {
  it("still renders the dark form with its checkbox", () => {
    const old = renderToStaticMarkup(createElement(MaterialForm, { mode: "create" }));
    expect(old).toContain("t2q-btn-primary-pro");
    expect(old).toContain("This price includes GST — save it ex-GST");
    expect(old).toMatch(/<input[^>]*type="checkbox"[^>]*name="price_includes_gst"/);
  });
});
