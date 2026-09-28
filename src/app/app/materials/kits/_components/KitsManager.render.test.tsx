// KitsManager's list view: honest wording about where a kit actually gets
// added to a quote (the job page's "Add a kit", built by another agent) —
// not a one-tap action from this screen itself.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ saveKit: vi.fn(), deleteKit: vi.fn() }));

import { KitsManager } from "./KitsManager";

describe("KitsManager — list view wording", () => {
  it("points at the job page's Add a kit, and never claims a one-tap add from here", () => {
    const html = renderToStaticMarkup(createElement(KitsManager, { initialKits: [], currency: "NZD" }));
    expect(html).toContain("Add a kit");
    expect(html).not.toContain("in one tap");
  });
});
