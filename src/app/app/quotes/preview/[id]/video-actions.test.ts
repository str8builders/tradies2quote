import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  captureError: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/observability", () => ({
  captureError: (...args: unknown[]) => state.captureError(...args),
}));

import { getQuoteVideoStatusAction, requestQuoteVideoAction } from "./video-actions";
import { QUOTE_VIDEO_MESSAGES, quoteVideoShareText } from "@/lib/quote-video/owner";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";

let quoteRow: Record<string, unknown> | null;
let videoRow: Record<string, unknown> | null;
let quoteError: unknown;
let rpcError: { code: string; message: string } | null;
let signed: { data: Array<{ signedUrl: string }> | null; error: unknown };
let db: ReturnType<typeof fakeSupabase>;
let rpc: ReturnType<typeof vi.fn>;
let createSignedUrls: ReturnType<typeof vi.fn>;
let user: { id: string } | null;

beforeEach(() => {
  quoteRow = { id: QUOTE_ID, version: 3, created_at: "2026-09-20T00:00:00Z" };
  videoRow = null;
  quoteError = null;
  rpcError = null;
  user = { id: OWNER };
  signed = {
    data: [{ signedUrl: "https://api.example.test/storage/v1/object/sign/quote-videos/v.mp4?token=a" }, { signedUrl: "https://api.example.test/storage/v1/object/sign/quote-videos/v.jpg?token=b" }],
    error: null,
  };
  state.captureError.mockReset();
  db = fakeSupabase((op: FakeOp) => {
    if (op.table === "quotes") return quoteError ? { error: quoteError } : { data: quoteRow };
    if (op.table === "quote_videos") return { data: videoRow };
    return {};
  });
  rpc = vi.fn(async () => ({ data: rpcError ? null : { status: "queued" }, error: rpcError }));
  state.client = { auth: { getUser: async () => ({ data: { user } }) }, from: db.from, rpc };
  createSignedUrls = vi.fn(async () => signed);
  state.admin = { storage: { from: vi.fn(() => ({ createSignedUrls })) } };
});

const quoteReads = () => db.ops.filter((op) => op.table === "quotes");
const videoReads = () => db.ops.filter((op) => op.table === "quote_videos");

describe("requestQuoteVideoAction", () => {
  it("queues a render through the RPC and reports it as being made", async () => {
    videoRow = { quote_version: 3, status: "queued", storage_path: null, poster_path: null };
    expect(await requestQuoteVideoAction(QUOTE_ID)).toEqual({ ok: true, status: { kind: "working", phase: "queued" } });
    expect(rpc).toHaveBeenCalledWith("request_quote_video", { p_quote_id: QUOTE_ID });
  });

  it("refuses a malformed quote id without touching the database", async () => {
    expect(await requestQuoteVideoAction("../../etc")).toEqual({ ok: false, error: QUOTE_VIDEO_MESSAGES.notFound });
    expect(rpc).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });

  it("asks a signed-out visitor to sign in", async () => {
    user = null;
    expect(await requestQuoteVideoAction(QUOTE_ID)).toEqual({ ok: false, error: QUOTE_VIDEO_MESSAGES.signIn });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["54000", QUOTE_VIDEO_MESSAGES.tooMany],
    ["55000", QUOTE_VIDEO_MESSAGES.locked],
    ["22023", QUOTE_VIDEO_MESSAGES.noItems],
    ["P0002", QUOTE_VIDEO_MESSAGES.notFound],
    ["42501", QUOTE_VIDEO_MESSAGES.notFound],
    ["28000", QUOTE_VIDEO_MESSAGES.signIn],
  ])("turns SQLSTATE %s into plain words", async (code, message) => {
    rpcError = { code, message: "raw database text" };
    expect(await requestQuoteVideoAction(QUOTE_ID)).toEqual({ ok: false, error: message });
    expect(state.captureError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure (e.g. migration missing) and says so plainly", async () => {
    rpcError = { code: "PGRST202", message: "Could not find the function" };
    expect(await requestQuoteVideoAction(QUOTE_ID)).toEqual({ ok: false, error: QUOTE_VIDEO_MESSAGES.requestFailed });
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });
});

describe("getQuoteVideoStatusAction", () => {
  it("returns 1-hour signed URLs for a ready video of the current version", async () => {
    videoRow = { quote_version: 3, status: "ready", storage_path: `${OWNER}/${QUOTE_ID}/v3.mp4`, poster_path: `${OWNER}/${QUOTE_ID}/v3.jpg` };
    expect(await getQuoteVideoStatusAction(QUOTE_ID)).toEqual({
      ok: true,
      status: {
        kind: "ready",
        videoUrl: signed.data![0].signedUrl,
        posterUrl: signed.data![1].signedUrl,
        fileName: "Q-2026-5D0A-video.mp4",
      },
    });
    expect(createSignedUrls).toHaveBeenCalledWith([`${OWNER}/${QUOTE_ID}/v3.mp4`, `${OWNER}/${QUOTE_ID}/v3.jpg`], 3600);
  });

  it("scopes both reads to the signed-in owner and the live quote", async () => {
    await getQuoteVideoStatusAction(QUOTE_ID);
    expect(quoteReads()[0].filters).toEqual([
      ["eq", "id", QUOTE_ID],
      ["eq", "user_id", OWNER],
      ["is", "deleted_at", null],
    ]);
    expect(videoReads()[0].filters).toEqual([
      ["eq", "quote_id", QUOTE_ID],
      ["eq", "user_id", OWNER],
    ]);
  });

  it("says the video is stale, without signing anything, once the quote has changed", async () => {
    videoRow = { quote_version: 2, status: "ready", storage_path: "a.mp4", poster_path: "a.jpg" };
    expect(await getQuoteVideoStatusAction(QUOTE_ID)).toEqual({ ok: true, status: { kind: "stale", hadVideo: true } });
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it.each([
    [{ quote_version: 3, status: "rendering", storage_path: null, poster_path: null }, { kind: "working", phase: "rendering" }],
    [{ quote_version: 3, status: "failed", storage_path: null, poster_path: null }, { kind: "failed" }],
    [null, { kind: "none" }],
  ])("reports %j", async (row, status) => {
    videoRow = row;
    expect(await getQuoteVideoStatusAction(QUOTE_ID)).toEqual({ ok: true, status });
  });

  it("does not find another owner's (or a deleted) quote", async () => {
    quoteRow = null;
    expect(await getQuoteVideoStatusAction(QUOTE_ID)).toEqual({ ok: false, error: QUOTE_VIDEO_MESSAGES.notFound });
    expect(videoReads()).toEqual([]);
  });

  it("says so plainly when the database or signing fails", async () => {
    quoteError = { code: "08006" };
    expect(await getQuoteVideoStatusAction(QUOTE_ID)).toEqual({ ok: false, error: QUOTE_VIDEO_MESSAGES.unavailable });
    quoteError = null;
    videoRow = { quote_version: 3, status: "ready", storage_path: "a.mp4", poster_path: "a.jpg" };
    signed = { data: null, error: { message: "Object not found" } };
    expect(await getQuoteVideoStatusAction(QUOTE_ID)).toEqual({ ok: false, error: QUOTE_VIDEO_MESSAGES.unavailable });
    expect(state.captureError).toHaveBeenCalledTimes(1);
  });
});

describe("quoteVideoShareText", () => {
  it("adds the quote link once the quote has been sent", () => {
    expect(quoteVideoShareText({ status: "sent", publicToken: "tok123", appUrl: "https://tradies2quote.com/" })).toBe(
      "Here's a quick video of your quote. View and accept it here: https://tradies2quote.com/quote/tok123",
    );
    expect(quoteVideoShareText({ status: "viewed", publicToken: "tok123", appUrl: "https://tradies2quote.com" })).toContain("/quote/tok123");
  });

  it.each([
    ["draft", "tok123"],
    ["declined", "tok123"],
    ["sent", null],
  ])("leaves the link out for a %s quote (token %j)", (status, publicToken) => {
    expect(quoteVideoShareText({ status, publicToken, appUrl: "https://tradies2quote.com" })).toBeUndefined();
  });
});
