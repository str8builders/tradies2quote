import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";
import { loadPublicQuoteVideo } from "./public";

const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
let row: Record<string, unknown> | null;
let rowError: unknown;
let createSignedUrls: ReturnType<typeof vi.fn>;
let db: ReturnType<typeof fakeSupabase>;
let admin: Parameters<typeof loadPublicQuoteVideo>[0];

beforeEach(() => {
  row = { quote_version: 4, status: "ready", storage_path: "u/q/v4.mp4", poster_path: "u/q/v4.jpg" };
  rowError = null;
  db = fakeSupabase((op: FakeOp) => (op.table === "quote_videos" ? { data: row, error: rowError } : {}));
  createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((p) => ({ signedUrl: `https://api.example.test/storage/v1/object/sign/quote-videos/${p}?token=t` })),
    error: null,
  }));
  admin = { from: db.from, storage: { from: () => ({ createSignedUrls }) } } as unknown as typeof admin;
});

describe("loadPublicQuoteVideo", () => {
  it("signs the ready video and poster of the quote's current version for an hour", async () => {
    expect(await loadPublicQuoteVideo(admin, { id: QUOTE_ID, version: 4 })).toEqual({
      videoUrl: "https://api.example.test/storage/v1/object/sign/quote-videos/u/q/v4.mp4?token=t",
      posterUrl: "https://api.example.test/storage/v1/object/sign/quote-videos/u/q/v4.jpg?token=t",
    });
    expect(createSignedUrls).toHaveBeenCalledWith(["u/q/v4.mp4", "u/q/v4.jpg"], 3600);
    expect(db.ops[0].filters).toEqual([
      ["eq", "quote_id", QUOTE_ID],
      ["eq", "quote_version", 4],
      ["eq", "status", "ready"],
    ]);
  });

  it("shows nothing when the only video is of an older version", async () => {
    row = { ...row, quote_version: 3 };
    expect(await loadPublicQuoteVideo(admin, { id: QUOTE_ID, version: 4 })).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("shows nothing without a ready video, or when the version is unknown", async () => {
    row = null;
    expect(await loadPublicQuoteVideo(admin, { id: QUOTE_ID, version: 4 })).toBeNull();
    expect(await loadPublicQuoteVideo(admin, { id: QUOTE_ID, version: undefined as unknown as number })).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("never breaks the page when reading or signing fails", async () => {
    rowError = { code: "42P01", message: "relation does not exist" };
    expect(await loadPublicQuoteVideo(admin, { id: QUOTE_ID, version: 4 })).toBeNull();
    rowError = null;
    createSignedUrls.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
    expect(await loadPublicQuoteVideo(admin, { id: QUOTE_ID, version: 4 })).toBeNull();
    createSignedUrls.mockRejectedValueOnce(new Error("network"));
    expect(await loadPublicQuoteVideo(admin, { id: QUOTE_ID, version: 4 })).toBeNull();
  });
});
