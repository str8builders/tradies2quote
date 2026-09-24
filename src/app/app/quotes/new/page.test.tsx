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

async function render(error?: string | string[]): Promise<string> {
  const element = (await NewQuotePage({
    searchParams: Promise.resolve(error === undefined ? {} : { error }),
  })) as ReactElement;
  return renderToStaticMarkup(element);
}

function oldFlowProps(html: string): Record<string, unknown> {
  const match = html.match(/data-testid="old-flow" data-props="([^"]*)"/);
  expect(match, "old flow rendered").not.toBeNull();
  return JSON.parse(match![1].replace(/&quot;/g, '"'));
}

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
