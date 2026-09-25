import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExtractRequestBody,
  extractSheet,
  isSheetAlreadyExtracted,
} from "../extract";
import { TIMEOUTS } from "@/lib/fetchTimeout";

/**
 * Plan-reader sheet extraction on the shared AI client: timeout + retry,
 * an explicit failure marker instead of a silent placeholder, the cacheable
 * static block, and the re-run skip rule.
 */

const SHEET = {
  title_block_text: "DECK PLAN\nScale 1:50",
  scale_text: "1:50",
  units: "mm",
  ocr_blocks: [{ text: "DECK", confidence: 0.9 }],
  dimensions: [{ value: 4800, unit: "mm", raw_text: "4800" }],
  ocr_confidence: 0.9,
};

const ok = () =>
  new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(SHEET) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1500, output_tokens: 120, cache_read_input_tokens: 0 },
    }),
    { status: 200 },
  );
const status = (code: number) =>
  new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), {
    status: code,
    headers: { "retry-after": "0" },
  });

const deps = (fetchImpl: typeof fetch) => ({
  apiKey: "k",
  imageBase64: "aGVsbG8=",
  mediaType: "image/png",
  sheetType: "deck" as const,
  fetchImpl,
  sleep: async () => {},
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("extractSheet", () => {
  it("retries a 529 and then reads the sheet", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(529)).mockResolvedValueOnce(ok());
    const out = await extractSheet(deps(fetchImpl as unknown as typeof fetch));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out.failure).toBeNull();
    expect(out.attempts).toBe(2);
    expect(out.extracted.extraction_error).toBeUndefined();
    expect(out.extracted.dimensions[0].value_m).toBe(4.8);
    expect(out.usage.inputTokens).toBe(1500);
  });

  it("marks a failed call instead of passing it off as a read", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(status(529));
    const out = await extractSheet(deps(fetchImpl as unknown as typeof fetch));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(out.failure?.kind).toBe("overloaded");
    expect(out.extracted.extraction_error).toBe("overloaded");
    expect(out.extracted.review_required).toBe(true);
    expect(out.extracted.warnings).toEqual(["extraction http 529"]);
  });

  it("marks an unparseable reply", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "no json here" }], stop_reason: "end_turn" })),
    );
    const out = await extractSheet(deps(fetchImpl as unknown as typeof fetch));
    expect(out.failure?.kind).toBe("unparseable");
    expect(out.extracted.extraction_error).toBe("unparseable");
  });

  it("bounds each attempt with the extraction timeout", async () => {
    vi.useFakeTimers();
    try {
      const hanging = vi.fn((_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
      );
      const pending = extractSheet(deps(hanging as unknown as typeof fetch));
      await vi.advanceTimersByTimeAsync(TIMEOUTS.extraction);
      const out = await pending;
      expect(out.failure?.kind).toBe("timeout");
      expect(out.extracted.warnings).toEqual(["extraction error: timeout"]);
      expect(hanging).toHaveBeenCalledTimes(1); // our own timeout is never retried
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("buildExtractRequestBody — cache split", () => {
  it("sends the static instructions as a cacheable system block and the sheet after it", () => {
    const body = buildExtractRequestBody({ imageBase64: "AAA", mediaType: "image/jpeg" });
    const system = body.system as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(system).toHaveLength(1);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toMatch(/^You are a construction-drawing OCR \+ dimension reader\./);
    const messages = body.messages as Array<{ content: Array<{ type: string }> }>;
    expect(messages[0].content.map((c) => c.type)).toEqual(["image", "text"]);
    expect(body.model).toBe("claude-opus-4-8");
  });

  it("keeps the static block identical for every sheet", () => {
    const a = buildExtractRequestBody({ imageBase64: "AAA" }).system;
    const b = buildExtractRequestBody({ imageBase64: "BBB", mediaType: "image/webp" }).system;
    expect(a).toEqual(b);
  });
});

describe("isSheetAlreadyExtracted", () => {
  const read = { warnings: ["scale not determined"], review_required: true };
  it("skips sheets that were read, whatever their gate outcome", () => {
    expect(isSheetAlreadyExtracted({ status: "extracted", extraction: read })).toBe(true);
    expect(isSheetAlreadyExtracted({ status: "needs_review", extraction: read })).toBe(true);
    expect(isSheetAlreadyExtracted({ status: "blocked", extraction: read })).toBe(true);
  });

  it("re-runs sheets whose call failed, never ran, or whose image was missing", () => {
    expect(isSheetAlreadyExtracted({ status: "blocked", extraction: { ...read, extraction_error: "timeout" } })).toBe(false);
    expect(isSheetAlreadyExtracted({ status: "classified", extraction: null })).toBe(false);
    expect(isSheetAlreadyExtracted({ status: "needs_review", extraction: null })).toBe(false);
  });

  it("recognises failed placeholders written before the marker existed", () => {
    for (const warning of ["extraction http 529", "extraction error: fetch failed", "extraction returned unparseable output"]) {
      expect(isSheetAlreadyExtracted({ status: "blocked", extraction: { warnings: [warning] } })).toBe(false);
    }
  });
});
