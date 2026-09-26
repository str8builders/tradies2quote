// Terms templates (/app/templates): the new-look switch, the new cards
// rendered to static HTML in node, the App Store wording kept (no plan name
// or plans link in the iPhone app, 3.1.3(f)), and the old page unchanged.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ on: false, native: false, user: { id: "user-1" } as { id: string } | null }));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: env.user } }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));

import TemplatesPage from "../page";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { Screen } from "@/components/ui/screen";
import { TemplatesManager } from "../TemplatesManager";
import { EMPTY_TEMPLATE, type TermsTemplatesState } from "../_lib/useTermsTemplates";
import { TemplatesCards, TemplatesView } from "./TemplatesCards";

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

function findAll(node: unknown, type: unknown): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.type === type) found.push(element);
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

const ITEMS = [
  { id: "t1", title: "Standard terms", body: "50% deposit.\nBalance on completion." },
  { id: "t2", title: "Small jobs", body: "Payment within 7 days." },
];

const noop = () => {};
function templates(over: Partial<TermsTemplatesState> = {}): TermsTemplatesState {
  return {
    items: ITEMS,
    enabled: true,
    edit: true,
    loaded: true,
    form: EMPTY_TEMPLATE,
    setForm: noop,
    error: "",
    notice: "",
    busy: false,
    load: async () => {},
    save: async () => {},
    ...over,
  };
}
const view = (over: Partial<TermsTemplatesState> = {}, inApp = false) =>
  renderToStaticMarkup(<TemplatesView templates={templates(over)} inApp={inApp} />);

beforeEach(() => {
  env.on = false;
  env.native = false;
  env.user = { id: "user-1" };
});

describe("/app/templates switch", () => {
  it("off: the old page and manager, unchanged", async () => {
    const tree = (await TemplatesPage()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, TemplatesManager)).toHaveLength(1);
    expect(findAll(tree, TemplatesCards)).toHaveLength(0);
    expect(renderToStaticMarkup(tree)).toContain("// builder workspace");
  });

  it("on: the cards under the shared top bar, the app flag passed on", async () => {
    env.on = true;
    env.native = true;
    const tree = (await TemplatesPage()) as ReactElement;
    expect(tree.type).toBe(Screen);
    expect(findAll(tree, AppHeader).map((el) => el.props.context)).toEqual(["Terms templates"]);
    expect(findAll(tree, TemplatesCards).map((el) => el.props.inApp)).toEqual([true]);
    const out = text(renderToStaticMarkup(tree));
    expect(out).toContain("Terms, ready to reuse");
    expect(out).not.toMatch(/builder/i);
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(TemplatesPage()).rejects.toThrow("NEXT_REDIRECT /login");
    env.on = true;
    await expect(TemplatesPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("TemplatesView (new look)", () => {
  it("a form card with the old limits, then each template as a card", () => {
    const html = view();
    expect(html).toContain("Add a template");
    expect(html).toMatch(/<input[^>]*required[^>]*maxLength="100"/);
    const area = html.match(/<textarea[^>]*>/)?.[0] ?? "";
    expect(area).toContain("required");
    expect(area).toContain('maxLength="20000"');
    expect(html).toContain(">Save template<");
    expect(html).toContain("Standard terms");
    expect(html).toContain("50% deposit.\nBalance on completion.");
    expect(html.match(/>Edit</g)).toHaveLength(2);
  });

  it("editing a template: its name in the title and a way to cancel", () => {
    const html = view({ form: ITEMS[0] });
    expect(html).toContain("Change this template");
    expect(html).toContain('value="Standard terms"');
    expect(html).toContain(">Cancel edit<");
  });

  it("read-only for people who can't edit", () => {
    const html = view({ edit: false });
    expect(html).not.toContain("<form");
    expect(html).not.toContain(">Edit<");
    expect(html).toContain("Standard terms");
  });

  it("not switched on: the website offers the plans, the iPhone app names no plan", () => {
    const web = view({ enabled: false, items: [], edit: false });
    expect(web).toContain("Reusable team terms are included with Builder.");
    expect(web).toContain('href="/app/upgrade?plan=builder"');
    const app = view({ enabled: false, items: [], edit: false }, true);
    expect(text(app)).toContain("Shared terms templates aren’t switched on for this account.");
    expect(app).not.toContain("/app/upgrade");
    expect(text(app)).not.toMatch(/builder|plans?\b/i);
  });

  it("loading, errors and a saved notice", () => {
    expect(view({ loaded: false, items: [], edit: false })).toContain("Loading your templates…");
    const html = view({ error: "Could not save.", notice: "Template saved." });
    expect(html).toMatch(/role="alert"[\s\S]*Could not save\./);
    expect(html).toMatch(/role="status"[\s\S]*Template saved\./);
  });

  it("uses the new look only", () => {
    expect(view()).not.toMatch(/t2q-|font-mono|uppercase|bg-ink-|text-white|\/\/ /);
  });
});

describe("the old manager is unchanged", () => {
  it("still renders (nothing until the templates load)", () => {
    expect(renderToStaticMarkup(<TemplatesManager />)).toBe('<div class="mt-8 space-y-6"></div>');
  });
});
