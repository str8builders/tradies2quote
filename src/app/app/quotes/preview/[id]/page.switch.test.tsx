// The job page switch: the new look renders only when isNewLookOn() is true;
// with the switch off the classic page runs exactly as before (and the new
// page's loader is never touched), whatever the URL says.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  newLook: false,
  createClient: vi.fn(),
}));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => state.newLook }));
vi.mock("./_v2/JobPageV2", () => ({ JobPageV2: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: (...args: unknown[]) => state.createClient(...args) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import QuotePreviewPage from "./page";
import { JobPageV2 } from "./_v2/JobPageV2";

const ID = "5d0a1c2e-5555-4666-8777-988888888888";
const call = (view?: string) =>
  QuotePreviewPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(view ? { view } : {}) });

beforeEach(() => {
  state.createClient.mockReset();
  // The classic path: signed in, but the quote can't be read, so it takes
  // its own "not found" redirect — proof the classic code ran.
  const db = fakeSupabase(() => ({ error: { message: "not found" } }));
  state.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "tradie@example.invalid" } } }) },
    from: db.from,
  });
});

describe("job page switch", () => {
  it("switch off: the classic page runs, the new page never renders", async () => {
    state.newLook = false;
    await expect(call()).rejects.toThrow("redirect:/app/quotes/new");
    expect(state.createClient).toHaveBeenCalledTimes(1);
  });

  it("switch off: ?view= changes nothing", async () => {
    state.newLook = false;
    await expect(call("new")).rejects.toThrow("redirect:/app/quotes/new");
  });

  it("switch on: the new-look job page renders for this quote, and the classic loader doesn't run", async () => {
    state.newLook = true;
    const out = await call();
    expect(isValidElement(out)).toBe(true);
    expect((out as { type: unknown }).type).toBe(JobPageV2);
    expect((out as { props: { id: string } }).props.id).toBe(ID);
    expect(state.createClient).not.toHaveBeenCalled();
  });

  it("switch on: the detailed editor link (?view=classic) opens the classic page", async () => {
    state.newLook = true;
    await expect(call("classic")).rejects.toThrow("redirect:/app/quotes/new");
    expect(state.createClient).toHaveBeenCalledTimes(1);
  });
});
