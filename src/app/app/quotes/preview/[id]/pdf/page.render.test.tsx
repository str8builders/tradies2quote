// The in-app PDF viewer page. Its gates (sign-in, owner, business name, a
// saved PDF) are the same in both looks; the old look's markup is pinned by
// file snapshots taken before the new look existed, so with the switch off
// it provably renders exactly as before. With it on, the kit's top bar and
// callouts, readable in dark and outdoor mode.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markupRuleBreaks } from "@/test/design-rules";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  newLook: false,
  user: { id: "u-1" } as { id: string } | null,
  quote: { id: "q-1", pdf_path: "u-1/q-1.pdf" } as { id: string; pdf_path: string | null } | null,
  profile: { business_name: "Bayside Builders" } as { business_name: string | null } | null,
  profileError: null as { message: string } | null,
  ops: [] as FakeOp[],
}));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => state.newLook }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => {
      state.ops.push(op);
      if (op.table === "quotes") return { data: state.quote };
      if (op.table === "profiles") return { data: state.profile, error: state.profileError };
    });
    return { auth: { getUser: async () => ({ data: { user: state.user } }) }, from: db.from };
  },
}));

import QuotePdfPage from "./page";

const ID = "q-1";

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

async function render(): Promise<string> {
  const element = (await QuotePdfPage({ params: Promise.resolve({ id: ID }) })) as ReactElement;
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  state.newLook = false;
  state.user = { id: "u-1" };
  state.quote = { id: ID, pdf_path: "u-1/q-1.pdf" };
  state.profile = { business_name: "Bayside Builders" };
  state.profileError = null;
  state.ops = [];
});

describe("switch off: the old look, exactly as before", () => {
  it("the viewer", async () => {
    await expect(await render()).toMatchFileSnapshot("./__snapshots__/page.old.viewer.html");
  });

  it("no business name yet", async () => {
    state.profile = { business_name: " " };
    await expect(await render()).toMatchFileSnapshot("./__snapshots__/page.old.no-business-name.html");
  });

  it("the business details couldn't be read", async () => {
    state.profileError = { message: "boom" };
    await expect(await render()).toMatchFileSnapshot("./__snapshots__/page.old.profile-error.html");
  });
});

describe("switch on: the new look", () => {
  beforeEach(() => {
    state.newLook = true;
  });

  it("the viewer: the kit's top bar, Back to the quote, and the PDF filling the rest", async () => {
    const out = await render();
    expect(out).toMatch(/<h1[^>]*>Quote PDF<\/h1>/);
    const back = tag(out, 'data-testid="pdf-back"');
    expect(back).toContain(`href="/app/quotes/preview/${ID}"`);
    expect(back).toContain("min-h-12");
    const frame = tag(out, 'data-testid="pdf-iframe"');
    expect(frame).toContain(`src="/api/quotes/${ID}/pdf"`);
    expect(frame).toContain('title="Quote PDF"');
  });

  it("the viewer covers the page but leaves the side rail from sm, and pads the notch itself", async () => {
    const out = await render();
    const viewer = tag(out, 'data-testid="pdf-viewer"');
    expect(viewer).toContain("fixed inset-0 z-30");
    expect(viewer).toContain("sm:left-[calc(6rem+env(safe-area-inset-left))]");
    expect(viewer).toContain("bg-ui-bg");
    expect(tag(out, "<header")).toContain("pt-[env(safe-area-inset-top)]");
  });

  it("no business name yet: says so, with Settings one tap away", async () => {
    state.profile = { business_name: " " };
    const out = await render();
    expect(out).toMatch(/<h1[^>]*>Quote PDF<\/h1>/);
    expect(tag(out, 'data-tone="warn"')).toBeTruthy();
    expect(out).toContain('role="alert"');
    expect(out).toContain("Add your business name in Settings before sending or downloading a quote.");
    expect(out).toMatch(/<a [^>]*href="\/app\/settings"[^>]*>.*Open Settings/);
    expect(tag(out, 'data-testid="pdf-back"')).toContain(`href="/app/quotes/preview/${ID}"`);
    expect(out).not.toContain('data-testid="pdf-iframe"');
  });

  it("the business details couldn't be read: says so, with a full reload", async () => {
    state.profileError = { message: "boom" };
    const out = await render();
    expect(out).toContain('data-tone="bad"');
    expect(out).toContain("Couldn&#x27;t load your business details");
    expect(out).toMatch(new RegExp(`<a href="/app/quotes/preview/${ID}/pdf"[^>]*>.*Try again`));
    expect(out).not.toContain("Open Settings");
    expect(out).not.toContain("boom");
  });

  it("follows the design rules, with nothing from the old look", async () => {
    const pages = [await render()];
    state.profile = { business_name: null };
    pages.push(await render());
    state.profileError = { message: "boom" };
    pages.push(await render());
    for (const out of pages) {
      expect(markupRuleBreaks(out)).toEqual([]);
      for (const old of ["t2q-btn-back", "bg-ink", "text-white", "font-mono", "// pdf preview"]) {
        expect(out).not.toContain(old);
      }
    }
  });

  it("the same gates", async () => {
    state.quote = { id: ID, pdf_path: null };
    await expect(render()).rejects.toThrow(`redirect:/app/quotes/preview/${ID}`);
    state.quote = null;
    await expect(render()).rejects.toThrow("redirect:/app/quotes");
    state.user = null;
    await expect(render()).rejects.toThrow("redirect:/login");
  });
});

describe("gates", () => {
  it("signed out goes to sign in", async () => {
    state.user = null;
    await expect(render()).rejects.toThrow("redirect:/login");
  });

  it("someone else's quote (or none) goes to the quotes list, checked by owner", async () => {
    state.quote = null;
    await expect(render()).rejects.toThrow("redirect:/app/quotes");
    const read = state.ops.find((op) => op.table === "quotes");
    expect(read?.filters).toEqual([
      ["eq", "id", ID],
      ["eq", "user_id", "u-1"],
    ]);
  });

  it("no saved PDF yet goes back to the quote", async () => {
    state.quote = { id: ID, pdf_path: null };
    await expect(render()).rejects.toThrow(`redirect:/app/quotes/preview/${ID}`);
  });
});
