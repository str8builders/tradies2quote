import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

/**
 * The client's quote link shows the tradie's video only for a live (sent or
 * viewed) quote AND only when the video was made from the quote's current
 * version. The heavy page parts are stubbed; the video logic is real.
 */
const state = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (iPhone)" }) }));
vi.mock("@/lib/payments", () => ({ getQuoteDepositInfo: async () => null }));
vi.mock("@/app/_components/quote/QuotePhotos", () => ({ QuotePhotos: () => null }));
vi.mock("./_components/PublicQuoteSummary", () => ({ PublicQuoteSummary: () => createElement("div", { "data-testid": "summary" }) }));
vi.mock("./_components/AcceptForm", () => ({ AcceptForm: () => null }));
vi.mock("./_components/AcceptedView", () => ({ AcceptedView: () => createElement("div", { "data-testid": "accepted" }) }));
vi.mock("./_components/ExpiredView", () => ({ ExpiredView: () => createElement("div", { "data-testid": "expired" }) }));
vi.mock("./_components/CustomerChat", () => ({ CustomerChat: () => null }));
vi.mock("./_components/PayDepositButton", () => ({ PayDepositButton: () => null }));

import PublicQuotePage from "./page";

const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
const USER_ID = "0f7f4f6e-1111-4222-8333-944444444444";
// Supabase signed URLs carry the object path, as the real ones do.
const signedUrl = (path: string) => `https://api.example.test/storage/v1/object/sign/quote-videos/${path}?token=signed`;
const VIDEO_URL = signedUrl(`${USER_ID}/${QUOTE_ID}/v5.mp4`);
const POSTER_URL = signedUrl(`${USER_ID}/${QUOTE_ID}/v5.jpg`);
let payload: Record<string, unknown>;
let videoRow: Record<string, unknown> | null;
let db: ReturnType<typeof fakeSupabase>;
let createSignedUrls: ReturnType<typeof vi.fn>;

beforeEach(() => {
  payload = {
    id: QUOTE_ID,
    status: "sent",
    version: 5,
    created_at: "2026-09-20T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    business_name: "Taylor Carpentry",
    client: { name: "Sam Taylor", address: null, email: null, phone: null },
    currency: "NZD",
    total: 4830,
    tax_label: "GST",
    line_items: [],
  };
  videoRow = { quote_version: 5, status: "ready", storage_path: `${USER_ID}/${QUOTE_ID}/v5.mp4`, poster_path: `${USER_ID}/${QUOTE_ID}/v5.jpg` };
  db = fakeSupabase((op: FakeOp) => {
    if (op.table === "quotes") return { data: { chat_disabled: false } };
    if (op.table === "quote_videos") {
      // Mirror the real filter: the row only comes back for the requested version.
      const version = op.filters.find(([, column]) => column === "quote_version")?.[2];
      return { data: videoRow && videoRow.quote_version === version ? videoRow : null };
    }
    return {};
  });
  createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((p) => ({ signedUrl: signedUrl(p) })),
    error: null,
  }));
  state.admin = {
    rpc: vi.fn(async (fn: string) => (fn === "get_quote_by_token" ? { data: payload, error: null } : { data: null, error: null })),
    from: db.from,
    storage: { from: () => ({ createSignedUrls }) },
  };
});

async function render(): Promise<string> {
  const element = (await PublicQuotePage({
    params: Promise.resolve({ token: "tok_live_123" }),
    searchParams: Promise.resolve({}),
  })) as ReactElement;
  return renderToStaticMarkup(element);
}

describe("public quote page — quote video", () => {
  it.each(["sent", "viewed"])("plays a video of the current version on a %s quote", async (status) => {
    payload.status = status;
    const html = await render();
    expect(html).toContain('data-testid="public-quote-video"');
    expect(html).toContain(`poster="${POSTER_URL}"`);
    expect(html).toContain(`src="${VIDEO_URL}"`);
    expect(html).toContain('preload="none"');
    expect(html).not.toMatch(/autoplay/i);
    // Above the quote itself.
    expect(html.indexOf("public-quote-video")).toBeLessThan(html.indexOf('data-testid="summary"'));
  });

  it("never shows a video made from an older version of the quote", async () => {
    videoRow = { ...videoRow, quote_version: 4 };
    const html = await render();
    expect(html).not.toContain("public-quote-video");
    expect(html).toContain('data-testid="summary"');
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("shows no video while it is still being made", async () => {
    videoRow = null;
    expect(await render()).not.toContain("public-quote-video");
  });

  it.each(["draft", "accepted", "declined", "expired"])("shows no video on a %s quote", async (status) => {
    payload.status = status;
    const html = await render();
    expect(html).not.toContain("public-quote-video");
    expect(db.ops.some((op) => op.table === "quote_videos")).toBe(false);
  });

  it("puts nothing about the files in the page beyond the two signed URLs", async () => {
    const html = await render();
    const rest = html.split(VIDEO_URL).join("").split(POSTER_URL).join("");
    expect(rest).not.toContain(USER_ID);
    expect(rest).not.toContain("quote-videos");
    expect(rest).not.toContain(".mp4");
  });
});
