// The new-quote page: who gets in (sign-in, trial/subscription, iOS AI
// consent), which inputs are offered, and which look renders. The old look's
// markup is pinned by file snapshots taken before the redesign switch was
// added, so "switch off" provably means "exactly as before".

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; created_at: string } | null,
  canWrite: true,
  nativeShell: false,
  consented: false,
  newLook: false,
  redirects: [] as string[],
  subscriptionCalls: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirects.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/auth", () => ({
  getCachedAuthUser: async () => ({ user: state.user, error: null }),
}));
vi.mock("@/lib/subscription", () => ({
  getCachedSubscriptionStatus: async () => {
    state.subscriptionCalls += 1;
    return { state: state.canWrite ? "trialing" : "expired" };
  },
  canWrite: () => state.canWrite,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => state.nativeShell }));
vi.mock("@/lib/ai-consent", () => ({ hasAiConsent: async () => state.consented }));
vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => state.newLook }));
vi.mock("../../_components/AppHeader", () => ({
  AppHeader: ({ context }: { context?: string }) =>
    createElement("header", { "data-testid": "app-header", "data-context": context }),
}));
vi.mock("./_components/QuoteInputTabs", () => ({
  QuoteInputTabs: (props: Record<string, unknown>) =>
    createElement("div", { "data-testid": "old-flow", "data-props": JSON.stringify(props) }),
}));
vi.mock("./_v2/NewQuoteFlow", () => ({
  NewQuoteFlow: (props: Record<string, unknown>) =>
    createElement("div", { "data-testid": "new-flow", "data-props": JSON.stringify(props) }),
}));

import NewQuotePage from "./page";

const USER = { id: "u-1", email: "tradie@example.test", created_at: "2026-09-01T00:00:00Z" };

beforeEach(() => {
  state.user = USER;
  state.canWrite = true;
  state.nativeShell = false;
  state.consented = false;
  state.newLook = false;
  state.redirects = [];
  state.subscriptionCalls = 0;
  vi.unstubAllEnvs();
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
});

async function render(error?: string | string[], start?: string): Promise<string> {
  const params: { error?: string | string[]; start?: string } = {};
  if (error !== undefined) params.error = error;
  if (start !== undefined) params.start = start;
  const element = (await NewQuotePage({ searchParams: Promise.resolve(params) })) as ReactElement;
  return renderToStaticMarkup(element);
}

function flowProps(html: string, which: "old-flow" | "new-flow"): Record<string, unknown> {
  const match = html.match(new RegExp(`data-testid="${which}" data-props="([^"]*)"`));
  expect(match, `${which} rendered`).not.toBeNull();
  return JSON.parse(match![1].replace(/&quot;/g, '"'));
}
const oldFlowProps = (html: string) => flowProps(html, "old-flow");
const newFlowProps = (html: string) => flowProps(html, "new-flow");

describe("switch off: the old look, exactly as before", () => {
  it.each([
    ["default", undefined],
    ["draft-failed", "draft-failed"],
    ["missing-transcript", ["missing-transcript", "draft-failed"]],
    ["unknown-error", "not-a-real-error"],
  ] as const)("page markup: %s", async (name, error) => {
    await expect(await render(error as string | string[] | undefined)).toMatchFileSnapshot(
      `./__snapshots__/page.old.${name}.html`,
    );
  });

  it("offers only the inputs whose provider is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", " ");
    const html = await render();
    await expect(html).toMatchFileSnapshot("./__snapshots__/page.old.type-only.html");
    expect(oldFlowProps(html)).toEqual({ needsAiConsent: false, voiceEnabled: false, scanEnabled: false });
  });

  it("never shows the new flow", async () => {
    expect(await render("draft-failed")).not.toContain('data-testid="new-flow"');
  });
});

describe("switch on: the new look, behind the same gates", () => {
  beforeEach(() => {
    state.newLook = true;
  });

  it("renders the new flow instead of the tabs, with the header for wider screens", async () => {
    const html = await render();
    expect(html).not.toContain('data-testid="old-flow"');
    expect(html).not.toContain("step 1 of 3");
    expect(html).toContain('data-testid="app-header" data-context="New quote"');
    expect(newFlowProps(html)).toEqual({ needsAiConsent: false, voiceEnabled: true, scanEnabled: true, start: null });
  });

  it("?start=talk (Home's Talk a quote) opens on the mic; anything else is ignored", async () => {
    expect(newFlowProps(await render(undefined, "talk")).start).toBe("talk");
    expect(newFlowProps(await render(undefined, "scan")).start).toBeNull();
  });

  it("passes the page's error key on (the first of several)", async () => {
    expect(newFlowProps(await render("draft-failed")).errorKey).toBe("draft-failed");
    expect(newFlowProps(await render(["missing-transcript", "draft-failed"])).errorKey).toBe("missing-transcript");
  });

  it("offers the same inputs as the tabs would", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(newFlowProps(await render())).toMatchObject({ voiceEnabled: false, scanEnabled: true });
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(newFlowProps(await render())).toMatchObject({ voiceEnabled: false, scanEnabled: false });
  });

  it("an expired trial still goes to the upgrade page first", async () => {
    state.canWrite = false;
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /app/upgrade?from=new-quote");
  });

  it("signed out still goes to sign in", async () => {
    state.user = null;
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("the iOS AI-consent gate is decided exactly as for the tabs", async () => {
    for (const [nativeShell, consented, needed] of [
      [true, false, true],
      [true, true, false],
      [false, false, false],
      [false, true, false],
    ] as const) {
      state.nativeShell = nativeShell;
      state.consented = consented;
      state.newLook = true;
      const onNew = newFlowProps(await render()).needsAiConsent;
      state.newLook = false;
      const onOld = oldFlowProps(await render()).needsAiConsent;
      expect([onNew, onOld]).toEqual([needed, needed]);
    }
  });
});

describe("gates", () => {
  it("signed out goes to sign in", async () => {
    state.user = null;
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(state.redirects).toEqual(["/login"]);
  });

  it("an expired trial goes to the upgrade page before anything renders", async () => {
    state.canWrite = false;
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /app/upgrade?from=new-quote");
    expect(state.subscriptionCalls).toBe(1);
  });

  it("asks for AI consent only inside the iOS app, until it is given", async () => {
    state.nativeShell = true;
    expect(oldFlowProps(await render()).needsAiConsent).toBe(true);
    state.consented = true;
    expect(oldFlowProps(await render()).needsAiConsent).toBe(false);
    state.nativeShell = false;
    state.consented = false;
    expect(oldFlowProps(await render()).needsAiConsent).toBe(false);
  });
});
