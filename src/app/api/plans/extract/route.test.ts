import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * A re-run of /api/plans/extract must only pay for the sheets whose read
 * failed: sheets already read are skipped, failed-call placeholders are
 * retried. Model-call failures reach captureError.
 */

type Sheet = {
  id: string;
  sheet_number: number;
  image_path: string;
  sheet_type: string;
  review_required: boolean;
  status: string;
  extraction: unknown;
};

const h = vi.hoisted(() => ({
  sheets: [] as Sheet[],
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  downloads: [] as string[],
  capture: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({ captureError: h.capture }));
vi.mock("@/lib/planreader/flag", () => ({ planReaderAllowed: () => true }));
vi.mock("@/lib/subscription", () => ({ getSubscriptionStatus: async () => ({ state: "trialing" }), canWrite: () => true }));
vi.mock("@/lib/rate-limit", () => ({ consumeDailyQuota: () => ({ ok: true }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "t@example.invalid", created_at: "2026-09-01T00:00:00Z" } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: h.sheets, error: null }),
        maybeSingle: async () => ({ data: { id: "f-1", original_filename: "deck-plan.pdf" }, error: null }),
        update: (payload: Record<string, unknown>) => {
          h.updates.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
      });
      return chain;
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          h.downloads.push(path);
          return { data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), error: null };
        },
      }),
    },
  }),
}));

import { POST } from "./route";

const SHEET_JSON = {
  title_block_text: "DECK PLAN",
  scale_text: "1:50",
  units: "mm",
  ocr_blocks: [],
  dimensions: [{ value: 4800, unit: "mm", raw_text: "4800" }],
  ocr_confidence: 0.9,
};

const post = () =>
  POST(new NextRequest("https://app.test/api/plans/extract", { method: "POST", body: JSON.stringify({ file_id: "f-1" }) }));

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  h.updates.length = 0;
  h.downloads.length = 0;
  h.capture.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/plans/extract re-run", () => {
  it("skips sheets already read and retries the failed one", async () => {
    h.sheets = [
      { id: "s1", sheet_number: 1, image_path: "p/1.png", sheet_type: "deck", review_required: false, status: "extracted", extraction: { warnings: [] } },
      { id: "s2", sheet_number: 2, image_path: "p/2.png", sheet_type: "deck", review_required: false, status: "blocked", extraction: { warnings: ["extraction http 529"], extraction_error: "overloaded" } },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(SHEET_JSON) }], stop_reason: "end_turn" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sheets: Array<{ sheet_number: number; action: string; skip_reason?: string }> };
    expect(body.sheets).toEqual([
      expect.objectContaining({ sheet_number: 1, action: "skipped", skip_reason: "already extracted" }),
      expect.objectContaining({ sheet_number: 2, action: "extracted" }),
    ]);
    expect(h.downloads).toEqual(["p/2.png"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const saved = h.updates.find((u) => u.table === "plan_sheets")?.payload.extraction as { extraction_error?: string };
    expect(saved.extraction_error).toBeUndefined();
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("reports a failed model call and stores a retryable placeholder", async () => {
    h.sheets = [
      { id: "s1", sheet_number: 1, image_path: "p/1.png", sheet_type: "deck", review_required: false, status: "classified", extraction: null },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "image too large" } }), { status: 400 })),
    );

    const res = await post();
    expect(res.status).toBe(200);
    const saved = h.updates.find((u) => u.table === "plan_sheets")?.payload;
    expect((saved?.extraction as { extraction_error?: string }).extraction_error).toBe("bad_request");
    expect(saved?.review_required).toBe(true);
    expect(h.capture).toHaveBeenCalledWith(expect.anything(), { route: "plans/extract" });
  });
});
