import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  ua: "",
  consentAt: null as string | null,
  fetch: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k.toLowerCase() === "user-agent" ? h.ua : null),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "tradie@example.invalid", created_at: "2026-09-01T00:00:00Z" } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const { AI_CONSENT_VERSION } = await vi.importActual<typeof import("@/lib/ai-consent")>("@/lib/ai-consent");
            return { data: { ai_consent_at: h.consentAt, ai_consent_version: AI_CONSENT_VERSION }, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/subscription", () => ({ getSubscriptionStatus: async () => ({ state: "trialing" }), canWrite: () => true }));
vi.mock("@/lib/owner", () => ({ isOwnerEmail: () => true }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";

const NATIVE_UA = "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell";
const WEB_UA = "Mozilla/5.0 (iPhone) Safari/604.1";

let photoWithGps: Buffer;
beforeAll(async () => {
  photoWithGps = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#f4f1ea" } })
    .jpeg()
    .withExif({
      IFD0: { Copyright: "t2q-exif-marker" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "37/1 41/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "176/1 10/1 0/1" },
    })
    .toBuffer();
});

function post() {
  const form = new FormData();
  form.append("image", new File([new Uint8Array(photoWithGps)], "quote.jpg", { type: "image/jpeg" }));
  return POST(new NextRequest("https://tradies2quote.com/api/materials/extract-quote", { method: "POST", body: form }));
}

const EXTRACTION = {
  supplier: "ITM",
  quote_number: "Q-1",
  currency: "NZD",
  gst_inclusive: false,
  items: [
    { name: "90x45 H1.2", unit: "length", quantity: 19, pieces: null, price: 12.4, line_total: 235.6, sku: null, raw_text: "19 @ 12.40 = 235.60", confidence: 0.95 },
  ],
  subtotal: 235.6,
  gst: 35.34,
  total: 270.94,
  notes: [],
};

function anthropicOk(body: unknown) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(body) }], stop_reason: "end_turn" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubGlobal("fetch", h.fetch);
  h.fetch.mockReset();
  h.fetch.mockImplementation(async () => anthropicOk(EXTRACTION));
  h.ua = WEB_UA;
  h.consentAt = null;
});

describe("POST /api/materials/extract-quote", () => {
  it("blocks the iOS app without AI consent before any image leaves the server", async () => {
    h.ua = NATIVE_UA;
    const res = await post();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error?: string }).error).toBe("ai_consent_required");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("lets a consented iOS user scan", async () => {
    h.ua = NATIVE_UA;
    h.consentAt = "2026-09-01T00:00:00Z";
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("asks Sonnet 5 for low effort and keeps the 8192-token cap", async () => {
    await post();
    const body = JSON.parse(String(h.fetch.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.max_tokens).toBe(8192);
    expect(body.output_config).toEqual({ effort: "low" });
  });

  it("strips EXIF/GPS from the photo before it is sent to the AI", async () => {
    expect((await sharp(photoWithGps).metadata()).exif).toBeDefined();
    await post();
    const body = JSON.parse(String(h.fetch.mock.calls[0][1]?.body)) as {
      messages: Array<{ content: Array<{ type: string; source?: { data: string; media_type: string } }> }>;
    };
    const image = body.messages[0].content.find((c) => c.type === "image")!;
    const sent = Buffer.from(image.source!.data, "base64");
    expect(sent.includes(Buffer.from("t2q-exif-marker"))).toBe(false);
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
    expect(image.source!.media_type).toBe("image/jpeg");
  });

  it("returns each line's printed total as source_line_total (the field the review screen reads)", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(data.items[0]).toMatchObject({ source_line_total: 235.6, price: 12.4, quantity: 19 });
  });
});
