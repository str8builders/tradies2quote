import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ fetch: vi.fn(), timeouts: [] as number[] }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k.toLowerCase() === "user-agent" ? "Mozilla/5.0 Safari/604.1" : null) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "tradie@example.invalid", created_at: "2026-09-01T00:00:00Z" } } }) },
  }),
}));
vi.mock("@/lib/subscription", () => ({ getSubscriptionStatus: async () => ({ state: "trialing" }), canWrite: () => true }));
vi.mock("@/lib/rate-limit", () => ({ consumeDailyQuota: () => ({ ok: true }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
// Record the per-attempt timeout while keeping the real timeout behaviour.
vi.mock("@/lib/fetchTimeout", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/fetchTimeout")>();
  return {
    ...real,
    fetchWithTimeout: (input: string, init: RequestInit, timeoutMs: number, impl?: typeof fetch) => {
      h.timeouts.push(timeoutMs);
      return real.fetchWithTimeout(input, init, timeoutMs, impl);
    },
  };
});

import { POST } from "./route";
import { TIMEOUTS } from "@/lib/fetchTimeout";

let drawingWithGps: Buffer;
beforeAll(async () => {
  drawingWithGps = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#ffffff" } })
    .jpeg()
    .withExif({
      IFD0: { Copyright: "t2q-exif-marker" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "37/1 41/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "176/1 10/1 0/1" },
    })
    .toBuffer();
});

function post() {
  const form = new FormData();
  form.append("image", new File([new Uint8Array(drawingWithGps)], "deck.jpg", { type: "image/jpeg" }));
  return POST(new NextRequest("https://tradies2quote.com/api/quotes/scan-drawing", { method: "POST", body: form }));
}

const SCAN = { dimensions: "Deck 4.8m x 3.6m", structural: "Joists 450 crs", notes: "", detectedType: "Deck", summary: "Deck", buildType: "deck" };
const ok = () =>
  new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(SCAN) }], stop_reason: "end_turn" }), { status: 200 });
const overloaded = (status: number) =>
  new Response(JSON.stringify({ type: "error", error: { type: status === 529 ? "overloaded_error" : "rate_limit_error" } }), {
    status,
    headers: { "retry-after": "0" },
  });

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubGlobal("fetch", h.fetch);
  h.fetch.mockReset();
  h.timeouts = [];
});

describe("POST /api/quotes/scan-drawing", () => {
  it("retries once when Anthropic is overloaded (529) and returns the scan", async () => {
    h.fetch.mockResolvedValueOnce(overloaded(529)).mockResolvedValueOnce(ok());
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(((await res.json()) as { detectedType: string }).detectedType).toBe("Deck");
  });

  it("retries once on a 429 rate limit too", async () => {
    h.fetch.mockResolvedValueOnce(overloaded(429)).mockResolvedValueOnce(ok());
    expect((await post()).status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry and reports the upstream status", async () => {
    h.fetch.mockResolvedValue(overloaded(529));
    const res = await post();
    expect(res.status).toBe(502);
    expect(((await res.json()) as { upstream_status?: number }).upstream_status).toBe(529);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a request error (400)", async () => {
    h.fetch.mockResolvedValue(new Response("{}", { status: 400 }));
    expect((await post()).status).toBe(502);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("waits up to the generation timeout for the Opus call, not the 50 s LLM ceiling", async () => {
    h.fetch.mockResolvedValueOnce(ok());
    await post();
    expect(h.timeouts).toEqual([TIMEOUTS.generation]);
  });

  it("strips EXIF/GPS from the drawing photo before it is sent to the AI", async () => {
    h.fetch.mockResolvedValueOnce(ok());
    await post();
    const body = JSON.parse(String(h.fetch.mock.calls[0][1]?.body)) as {
      messages: Array<{ content: Array<{ type: string; source?: { data: string } }> }>;
    };
    const sent = Buffer.from(body.messages[0].content.find((c) => c.type === "image")!.source!.data, "base64");
    expect(sent.includes(Buffer.from("t2q-exif-marker"))).toBe(false);
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
  });
});
