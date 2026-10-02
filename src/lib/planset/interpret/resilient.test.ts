import { describe, expect, it, vi } from "vitest";
import { AGAIN_DELAY_MS, MAX_PDF_BYTES, readSheetResilient, type ResilientCall } from "./resilient";

type Body = { messages: Array<{ content: Array<{ type: string; source?: { data: string } }> }>; fallbacks?: unknown };
type Sent = { headers: Record<string, string>; body: Body };

const OK = {
  id: "msg_1",
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify({ specs: [{ topic: "cladding", value: "Linea", text_ids: [4] }] }) }],
  usage: { input_tokens: 100, output_tokens: 20 },
};
const reject = (message: string, status = 400) => ({ status, body: { type: "error", error: { type: status === 404 ? "not_found_error" : "invalid_request_error", message } } });

/** A fetch that answers from a script, one entry per request, and remembers what it was sent. */
function scripted(answers: Array<{ status: number; body: unknown } | "ok">) {
  const sent: Sent[] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push({ headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Body });
    const a = answers[sent.length - 1] ?? "ok";
    const { status, body } = a === "ok" ? { status: 200, body: OK } : a;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
}

const PDF = new Uint8Array([37, 80, 68, 70]);
const CLEAN = new Uint8Array([37, 80, 68, 70, 45, 49]);
const call = (over: Partial<ResilientCall> = {}): ResilientCall => ({
  pdf: PDF,
  clean: async () => CLEAN,
  prompt: "Sheet A1.\n\nText runs:\n4 | Linea | 1,1",
  textPrompt: "Sheet A1.\nThe page itself is not attached\nText runs:\n4 | Linea | 1,1",
  ...over,
});
const base = { apiKey: "test-key", sleep: async () => {} };
const hasPdf = (s: Sent) => s.body.messages[0].content.some((c) => c.type === "document");

describe("readSheetResilient", () => {
  it("one request when the service takes the page as it is", async () => {
    const { fetchImpl, sent } = scripted(["ok"]);
    const r = await readSheetResilient(call(), { ...base, fetchImpl });
    expect(r.rung).toBe("full");
    expect(r.reading.specs).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(hasPdf(sent[0])).toBe(true);
    expect(sent[0].headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
    expect(sent[0].body.fallbacks).toBe("default");
  });

  it("a page the service can't open is read from a cleaned copy, then from its words", async () => {
    const { fetchImpl, sent } = scripted([reject("messages.0.content.0.document.source.base64.data: The PDF specified was not valid."), "ok"]);
    const steps: string[] = [];
    const r = await readSheetResilient(call(), { ...base, fetchImpl, onStepDown: (i) => steps.push(`${i.from}>${i.to}:${i.why}`) });
    expect(r.rung).toBe("clean");
    expect(steps).toEqual(["full>clean:pdf"]);
    expect(sent).toHaveLength(2);
    expect(sent[1].body.messages[0].content[0].source?.data).toBe(Buffer.from(CLEAN).toString("base64"));

    const second = scripted([reject("Could not process PDF"), reject("Could not process PDF"), "ok"]);
    const r2 = await readSheetResilient(call(), { ...base, fetchImpl: second.fetchImpl });
    expect(r2.rung).toBe("text");
    expect(hasPdf(second.sent[2])).toBe(false);
    expect(second.sent[2].body.messages[0].content[0]).toMatchObject({ type: "text" });
    expect(JSON.stringify(second.sent[2].body.messages)).toContain("The page itself is not attached");
  });

  it("a request that is too big goes straight to the words", async () => {
    const { fetchImpl, sent } = scripted([reject("prompt is too long: 213456 tokens > 200000 maximum"), "ok"]);
    const r = await readSheetResilient(call(), { ...base, fetchImpl });
    expect(r.rung).toBe("text");
    expect(sent).toHaveLength(2);
  });

  it("a rejected routing setting is retried plain, and stays plain for the rest of the read", async () => {
    const { fetchImpl, sent } = scripted([reject("fallbacks: Extra inputs are not permitted"), reject("The PDF specified was not valid."), "ok"]);
    const r = await readSheetResilient(call(), { ...base, fetchImpl });
    expect(r.rung).toBe("clean");
    expect(sent[0].headers["anthropic-beta"]).toBeDefined();
    expect(sent[1].headers["anthropic-beta"]).toBeUndefined();
    expect(sent[1].body.fallbacks).toBeUndefined();
    expect(sent[2].headers["anthropic-beta"]).toBeUndefined();
  });

  it("a rejection nobody recognises is tried once more after a pause, then cleaned, then words", async () => {
    const sleeps: number[] = [];
    const { fetchImpl, sent } = scripted([reject("something new"), reject("something new"), reject("something new"), "ok"]);
    const r = await readSheetResilient(call(), { ...base, fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    expect(r.rung).toBe("text");
    expect(sleeps).toEqual([AGAIN_DELAY_MS]);
    expect(sent).toHaveLength(4);
  });

  it("an account or setup problem ends the read at once: no step-down", async () => {
    for (const msg of ["Your credit balance is too low to access the Anthropic API.", "output_config.format.schema: compiled grammar is too large", "model: claude-opus-9"]) {
      const { fetchImpl, sent } = scripted([reject(msg)]);
      await expect(readSheetResilient(call(), { ...base, fetchImpl })).rejects.toMatchObject({ kind: "bad_request" });
      expect(sent).toHaveLength(1);
    }
  });

  it("when every rung is turned down the error tells the whole story", async () => {
    const { fetchImpl } = scripted([reject("The PDF specified was not valid."), reject("Could not process PDF"), reject("text content blocks must be non-empty")]);
    const err = await readSheetResilient(call(), { ...base, fetchImpl }).catch((e) => e);
    expect(err.kind).toBe("bad_request");
    expect(err.detail).toContain("PDF specified was not valid");
    expect(err.detail).toContain("full, clean, text");
    expect(err.detail).toContain("non-empty");
  });

  it("a busy or slow service is not stepped down: the shared client already retried it", async () => {
    const { fetchImpl, sent } = scripted([{ status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }, { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }]);
    await expect(readSheetResilient(call(), { ...base, fetchImpl })).rejects.toMatchObject({ kind: "overloaded" });
    // two attempts from the shared retry policy, none from the ladder
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(sent.every(hasPdf)).toBe(true);
  });

  it("a page that couldn't be cut out, or is too big to send, is read from its words straight away", async () => {
    const a = scripted(["ok"]);
    const r = await readSheetResilient(call({ pdf: null }), { ...base, fetchImpl: a.fetchImpl });
    expect(r.rung).toBe("text");
    expect(hasPdf(a.sent[0])).toBe(false);

    const big = scripted(["ok"]);
    const r2 = await readSheetResilient(call({ pdf: new Uint8Array(MAX_PDF_BYTES + 1) }), { ...base, fetchImpl: big.fetchImpl });
    expect(r2.rung).toBe("text");
    expect(hasPdf(big.sent[0])).toBe(false);
  });

  it("a scan has no words to fall back on: cleaned copy only, then the error", async () => {
    const { fetchImpl, sent } = scripted([reject("The PDF specified was not valid."), reject("Could not process PDF")]);
    const err = await readSheetResilient(call({ textPrompt: undefined }), { ...base, fetchImpl }).catch((e) => e);
    expect(err.kind).toBe("bad_request");
    expect(sent).toHaveLength(2);
    expect(sent.every(hasPdf)).toBe(true);

    await expect(readSheetResilient(call({ pdf: null, textPrompt: undefined }), { ...base, fetchImpl: scripted(["ok"]).fetchImpl })).rejects.toMatchObject({ kind: "bad_request" });
  });

  it("builds the cleaned copy once however many rungs use it", async () => {
    const clean = vi.fn(async () => CLEAN);
    const { fetchImpl } = scripted([reject("something new"), reject("something new"), "ok"]);
    const r = await readSheetResilient(call({ clean }), { ...base, fetchImpl });
    expect(r.rung).toBe("clean");
    expect(clean).toHaveBeenCalledTimes(1);
  });
});
