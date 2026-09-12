import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSummary, cleanTranscript } from "./transcriptCleanup";
import { TIMEOUTS } from "./fetchTimeout";

const summary = { job_type: "Wall lining", dimensions: "6m x 2.7m", compliance_risks: ["Confirm wet-area lining"], confidence: 0.9 };
const response = () => new Response(JSON.stringify({ content: [{ type: "text", text: "```json\n" + JSON.stringify(summary) + "\n```" }], stop_reason: "end_turn" }));

beforeEach(() => {
  vi.stubEnv("TEXT_AI_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-hosted-key");
  vi.stubEnv("ANTHROPIC_QUOTE_MODEL", "");
  vi.stubEnv("TRANSCRIPT_SUMMARY", "");
  vi.stubEnv("LOCAL_LLM_API_KEY", "fixture-local-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("transcript summary provider routing", () => {
  it("uses the hosted Messages API and parses fenced JSON into the stored summary", async () => {
    const request = vi.fn().mockImplementation(response);
    vi.stubGlobal("fetch", request);
    const result = await cleanTranscript("h32 framing for a wall");
    expect(result.summary).toMatchObject(summary);
    expect(result.cleanedTranscript).toContain("H3.2");
    expect(result.fallback).toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "fixture-hosted-key", "anthropic-version": "2023-06-01" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "claude-sonnet-5", messages: [{ role: "user", content: result.cleanedTranscript }] });
    expect(body).not.toHaveProperty("temperature");
  });

  it("honours the configured hosted model", async () => {
    vi.stubEnv("ANTHROPIC_QUOTE_MODEL", " custom-hosted-model ");
    const request = vi.fn().mockImplementation(response);
    vi.stubGlobal("fetch", request);
    await buildSummary("Wall");
    expect(JSON.parse(request.mock.calls[0][1].body).model).toBe("custom-hosted-model");
  });

  it("does not use the local credential for a missing hosted key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await buildSummary("Wall")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves the local provider transport and credential", async () => {
    vi.stubEnv("TEXT_AI_PROVIDER", "local");
    vi.stubEnv("LOCAL_LLM_BASE_URL", "http://localhost:8080/v1/");
    vi.stubEnv("LOCAL_LLM_MODEL", "fixture-local-model");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(summary) } }] })));
    vi.stubGlobal("fetch", request);
    expect(await buildSummary("Wall")).toMatchObject(summary);
    expect(request.mock.calls[0][0]).toBe("http://localhost:8080/v1/chat/completions");
    expect(request.mock.calls[0][1].headers.authorization).toBe("Bearer fixture-local-key");
  });

  it("preserves callAnthropic without any network call", async () => {
    const transport = vi.fn().mockResolvedValue(JSON.stringify(summary));
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await buildSummary("Wall", { apiKey: "fixture-override", callAnthropic: transport })).toMatchObject(summary);
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "fixture-override" }));
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the off override even with an explicit transport", async () => {
    vi.stubEnv("TRANSCRIPT_SUMMARY", " OFF ");
    const transport = vi.fn();
    expect(await buildSummary("Wall", { callAnthropic: transport })).toBeNull();
    expect(await cleanTranscript("h32 framing", { callAnthropic: transport })).toMatchObject({ summary: null, fallback: "summary_disabled", cleanedTranscript: "H3.2 framing" });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    () => new Response("Unavailable", { status: 529 }),
    () => new Response(JSON.stringify({ content: [{ type: "text", text: "not JSON" }] })),
    () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(summary) }], stop_reason: "max_tokens" })),
  ])("retains the cleaned transcript when the provider fails", async (failure) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(failure));
    expect(await cleanTranscript("h32 framing")).toMatchObject({ summary: null, fallback: "summary_failed", cleanedTranscript: "H3.2 framing" });
  });

  it("aborts a stalled hosted summary at TIMEOUTS.llm", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    })));
    const pending = cleanTranscript("h32 framing");
    await vi.advanceTimersByTimeAsync(TIMEOUTS.llm);
    expect(await pending).toMatchObject({ summary: null, fallback: "summary_failed" });
  });
});
