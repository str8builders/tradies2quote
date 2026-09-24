import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit 2026-09-24, item 12 — buildSummary used to swallow every failure.
 * It still degrades to "no summary", but each failure is now reported to
 * the internal error monitor without personal data.
 */

const capture = vi.hoisted(() => ({ calls: [] as Array<[unknown, unknown]> }));
vi.mock("@/lib/observability", () => ({
  captureError: (e: unknown, ctx: unknown) => capture.calls.push([e, ctx]),
}));

import { buildSummary, cleanTranscript, type SummaryFailureReport } from "../transcriptCleanup";
import { reportSummaryFailureToMonitor } from "./summaryMonitoring";

const PRIVATE = "Dave Smith at 12 Beach Road, 021 555 1234";

beforeEach(() => {
  capture.calls.length = 0;
  vi.stubEnv("TRANSCRIPT_SUMMARY", "");
  vi.stubEnv("TEXT_AI_PROVIDER", "anthropic");
});
afterEach(() => vi.unstubAllEnvs());

describe("buildSummary failures are reported, PII-free", () => {
  it("a failed provider call reports stage + HTTP status only", async () => {
    const reports: SummaryFailureReport[] = [];
    const result = await buildSummary(`Deck for ${PRIVATE}`, {
      apiKey: "k",
      callAnthropic: async () => {
        throw new Error(`Summary provider returned HTTP 503 for ${PRIVATE}`);
      },
      onSummaryFailure: (r) => reports.push(r),
    });
    expect(result).toBeNull();
    expect(reports).toEqual([{ stage: "call", httpStatus: 503, errorName: "Error" }]);
    expect(JSON.stringify(reports)).not.toContain("Dave");
  });

  it("an unparsable reply reports the parse stage without the reply text", async () => {
    const reports: SummaryFailureReport[] = [];
    const result = await buildSummary("Deck", {
      apiKey: "k",
      callAnthropic: async () => `Sure! ${PRIVATE} wants a deck.`,
      onSummaryFailure: (r) => reports.push(r),
    });
    expect(result).toBeNull();
    expect(reports).toHaveLength(1);
    expect(reports[0].stage).toBe("parse");
    expect(JSON.stringify(reports)).not.toContain("Beach Road");
  });

  it("cleanTranscript forwards the hook", async () => {
    const reports: SummaryFailureReport[] = [];
    const out = await cleanTranscript("h32 framing", {
      apiKey: "k",
      callAnthropic: async () => {
        throw new TypeError("fetch failed");
      },
      onSummaryFailure: (r) => reports.push(r),
    });
    expect(out.fallback).toBe("summary_failed");
    expect(reports).toEqual([{ stage: "call", errorName: "TypeError" }]);
  });
});

describe("reportSummaryFailureToMonitor", () => {
  it("sends a fixed message + status to captureError, nothing else", () => {
    reportSummaryFailureToMonitor({ stage: "call", httpStatus: 503, errorName: "Error" });
    reportSummaryFailureToMonitor({ stage: "parse", errorName: "SyntaxError" });
    expect(capture.calls).toHaveLength(2);
    const [e1, c1] = capture.calls[0] as [Error, Record<string, unknown>];
    expect(e1.message).toBe("Transcript summary call failed");
    expect(c1).toEqual({
      route: "transcriptCleanup/buildSummary",
      httpStatus: 503,
      extra: { stage: "call", errorName: "Error" },
    });
    const [e2, c2] = capture.calls[1] as [Error, Record<string, unknown>];
    expect(e2.message).toBe("Transcript summary response was not valid JSON");
    expect(c2).not.toHaveProperty("httpStatus");
  });
});
