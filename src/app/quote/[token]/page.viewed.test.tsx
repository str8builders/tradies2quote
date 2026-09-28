import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

/**
 * The client's quote link: when it counts as "the client opened it" (never a
 * link-preview bot, never the tradie or their team checking it), the buzz the
 * tradie gets the first time, and the prices the page is given (the markup
 * folded in — never sent to the browser).
 */
const state = vi.hoisted(() => ({
  admin: null as unknown,
  rpc: vi.fn(),
  push: vi.fn(),
  getUser: vi.fn(),
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  summaryProps: [] as unknown[],
}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: state.getUser } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": state.userAgent }) }));
vi.mock("@/lib/push", () => ({ sendPushToUser: (...a: unknown[]) => state.push(...a) }));
vi.mock("@/lib/payments", () => ({ getQuoteDepositInfo: async () => null }));
vi.mock("@/app/_components/quote/QuotePhotos", () => ({ QuotePhotos: () => null }));
vi.mock("./_components/PublicQuoteSummary", () => ({
  PublicQuoteSummary: (props: unknown) => {
    state.summaryProps.push(props);
    return createElement("div", { "data-testid": "summary" });
  },
}));
vi.mock("./_components/AcceptForm", () => ({ AcceptForm: () => null }));
vi.mock("./_components/AcceptedView", () => ({ AcceptedView: () => null }));
vi.mock("./_components/ExpiredView", () => ({ ExpiredView: () => null }));
vi.mock("./_components/CustomerChat", () => ({ CustomerChat: () => null }));
vi.mock("./_components/PayDepositButton", () => ({ PayDepositButton: () => null }));

import PublicQuotePage from "./page";

const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
let firstView: unknown;
let teams: Array<{ user_id: string; team_id: string }>;

const payload = () => ({
  id: QUOTE_ID, status: "sent", version: 2, created_at: "2026-09-20T00:00:00Z", expires_at: "2099-01-01T00:00:00Z",
  business_name: "Taylor Carpentry", business_email: "hello@taylor.example", business_phone: "021 555 0101",
  client: { name: "Sam Taylor", address: null, email: null, phone: null },
  job_summary: "New kwila deck at 14 Rata St. Remove the old one first.",
  currency: "NZD", tax_label: "GST", tax_rate: 15, terms: null,
  line_items: [
    { type: "material", description: "Decking boards", quantity: 20, unit: "m", unit_price: 12.5, line_total: 250 },
    { type: "labour", description: "Deck build", quantity: 10, unit: "hour", unit_price: 85, line_total: 850 },
  ],
  materials_subtotal: 250, labour_subtotal: 850, markup_amount: 50,
  subtotal_before_tax: 1150, tax_amount: 172.5, total: 1322.5,
});

beforeEach(() => {
  firstView = null;
  teams = [];
  state.summaryProps = [];
  state.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  state.getUser.mockReset().mockResolvedValue({ data: { user: null } });
  state.push.mockReset().mockResolvedValue(undefined);
  state.rpc.mockReset().mockImplementation(async (fn: string) =>
    fn === "get_quote_by_token" ? { data: payload(), error: null } : { data: firstView, error: null },
  );
  const db = fakeSupabase((op: FakeOp) => {
    if (op.table === "quotes") return { data: { user_id: OWNER, chat_disabled: false } };
    if (op.table === "team_members") {
      const wanted = op.filters.find(([method]) => method === "in")?.[2] as string[];
      return { data: teams.filter((t) => wanted.includes(t.user_id)) };
    }
    return {};
  });
  state.admin = { rpc: state.rpc, from: db.from };
});

async function open(): Promise<string> {
  const element = (await PublicQuotePage({
    params: Promise.resolve({ token: "tok_live_123" }),
    searchParams: Promise.resolve({}),
  })) as ReactElement;
  return renderToStaticMarkup(element);
}

const markedViewed = () => state.rpc.mock.calls.some(([fn]) => fn === "mark_quote_viewed");

describe("public quote — the client opening it", () => {
  it("records the client's visit and buzzes the tradie the first time", async () => {
    firstView = { quote_id: QUOTE_ID, user_id: OWNER };
    await open();
    expect(markedViewed()).toBe(true);
    expect(state.push).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledWith(OWNER, {
      title: "Sam opened your quote",
      body: "New kwila deck at 14 Rata St",
      url: `/app/quotes/preview/${QUOTE_ID}`,
      tag: `quote-opened-${QUOTE_ID}`,
    });
  });

  it("stays quiet on later visits (and before the database says which visit was first)", async () => {
    firstView = null;
    await open();
    expect(markedViewed()).toBe(true);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("a failed buzz never breaks the page", async () => {
    firstView = { quote_id: QUOTE_ID, user_id: OWNER };
    state.push.mockRejectedValue(new Error("push down"));
    expect(await open()).toContain('data-testid="summary"');
  });

  it("the tradie opening their own link is not the client opening it", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    firstView = { quote_id: QUOTE_ID, user_id: OWNER };
    expect(await open()).toContain('data-testid="summary"');
    expect(markedViewed()).toBe(false);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("nor is someone on the tradie's team", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: "crew-member" } } });
    teams = [
      { user_id: OWNER, team_id: "team-1" },
      { user_id: "crew-member", team_id: "team-1" },
    ];
    await open();
    expect(markedViewed()).toBe(false);
  });

  it("a signed-in stranger (another business) still counts as a visit", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: "someone-else" } } });
    teams = [
      { user_id: OWNER, team_id: "team-1" },
      { user_id: "someone-else", team_id: "team-2" },
    ];
    await open();
    expect(markedViewed()).toBe(true);
  });

  it("an error checking who is signed in counts as the client", async () => {
    state.getUser.mockRejectedValue(new Error("auth offline"));
    await open();
    expect(markedViewed()).toBe(true);
  });

  it("a link-preview bot never counts", async () => {
    state.userAgent = "facebookexternalhit/1.1";
    await open();
    expect(markedViewed()).toBe(false);
  });
});

describe("public quote — the prices the page is given", () => {
  it("has the markup folded in, never as its own figure", async () => {
    await open();
    const { quote } = state.summaryProps[0] as {
      quote: { markup_amount: number; line_items: Array<{ unit_price: number; line_total: number }>; total: number };
    };
    expect(quote.markup_amount).toBe(0);
    expect(quote.line_items.map((l) => [l.unit_price, l.line_total])).toEqual([
      [15, 300],
      [85, 850],
    ]);
    expect(quote.total).toBe(1322.5);
  });
});
