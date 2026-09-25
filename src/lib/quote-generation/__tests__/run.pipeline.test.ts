import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { DEFAULT_NZ_CONTRACT_TERMS } from "@/lib/default-contract";

/**
 * End-to-end through the REAL pipeline (`generateQuoteForUser`) with the
 * quote model and the critic mocked — no LLM call — and an in-memory
 * Supabase stub that records what would be saved. Audit 2026-09-24,
 * items 1, 3, 4, 5, 6, 7 and 9.
 */

const provider = vi.hoisted(() => ({
  output: {} as unknown,
  calls: [] as Array<{ system: unknown; user: string; outputSchema?: unknown }>,
  /** Replies served before `output` (e.g. a cut-off one to repair). */
  queue: [] as Array<{ text: string; stopReason: string }>,
}));
vi.mock("@/lib/llm/anthropic-quote", () => ({
  ANTHROPIC_QUOTE_MAX_TOKENS: 16384,
  runAnthropicQuoteCompletion: async (args: { system: unknown; user: string; outputSchema?: unknown }) => {
    provider.calls.push({ system: args.system, user: args.user, outputSchema: args.outputSchema });
    const queued = provider.queue.shift();
    if (queued) return { ...queued, model: "mock" };
    return {
      text: JSON.stringify(provider.output),
      model: "mock",
      stopReason: "end_turn",
    };
  },
}));

const critic = vi.hoisted(() => ({
  calls: [] as Array<{ agentName: string; user: string; system: string; maxTokens?: number }>,
  fail: false,
}));
vi.mock("@/lib/agents/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/runtime")>();
  return {
    ...actual,
    runStructuredAgent: async (opts: {
      agentName: string;
      user: unknown;
      system: string;
      maxTokens?: number;
    }) => {
      critic.calls.push({
        agentName: opts.agentName,
        user: String(opts.user),
        system: opts.system,
        maxTokens: opts.maxTokens,
      });
      if (critic.fail) throw new Error("critic unavailable");
      return {
        value: { scopeCovered: true, issues: [] },
        model: "mock",
        attempts: 1,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      };
    },
  };
});
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { generateQuoteForUser } from "../run";

type Row = Record<string, unknown>;

function makeDb(opts: { transcript: string; profile: Row; library?: Row[] }) {
  const saved: { quote?: Row; items?: Row[] } = {};
  const quoteRow = { id: "q-1", voice_transcript: opts.transcript, quote_data: null };
  function from(table: string) {
    let op: "select" | "update" | "insert" | "delete" = "select";
    let payload: unknown = null;
    let cols = "";
    const result = () => {
      if (op === "update" && table === "quotes") saved.quote = payload as Row;
      if (op === "insert" && table === "quote_items") saved.items = payload as Row[];
      if (op !== "select") return { data: null, error: null };
      if (table === "quotes" && cols.includes("voice_transcript")) return { data: quoteRow, error: null };
      if (table === "profiles") return { data: opts.profile, error: null };
      if (table === "materials" && cols.includes("default_unit_price")) {
        return { data: opts.library ?? [], error: null };
      }
      return { data: [], error: null };
    };
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: (c?: string) => {
        cols = c ?? "";
        return b;
      },
      update: (p: unknown) => {
        op = "update";
        payload = p;
        return b;
      },
      insert: (p: unknown) => {
        op = "insert";
        payload = p;
        return b;
      },
      delete: () => {
        op = "delete";
        return b;
      },
      eq: chain,
      neq: chain,
      not: chain,
      in: chain,
      is: chain,
      order: chain,
      limit: chain,
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(res, rej),
    });
    return b;
  }
  return { db: { from } as unknown as SupabaseClient<Database>, saved };
}

const NZ_PROFILE: Row = {
  business_name: "Test Builders",
  country: "NZ",
  default_labour_rate: 75,
  default_markup_pct: 20,
  tax_label: "GST",
  tax_rate: 15,
  currency: "NZD",
};

const lib = (id: string, name: string, unit: string | null, price: number | null): Row => ({
  id,
  name,
  unit,
  default_unit_price: price,
  supplier: null,
  supplier_url: null,
  notes: null,
  usage_count: 1,
  is_ai_estimated: false,
  last_used_at: null,
});

async function generate(args: {
  transcript: string;
  model: unknown;
  profile?: Row;
  library?: Row[];
  asAdmin?: boolean;
}) {
  provider.output = args.model;
  const { db, saved } = makeDb({
    transcript: args.transcript,
    profile: args.profile ?? NZ_PROFILE,
    library: args.library,
  });
  const result = await generateQuoteForUser({
    db,
    userId: "11111111-1111-1111-1111-111111111111",
    quoteId: "q-1",
    textProvider: "anthropic",
    asAdmin: args.asAdmin,
  });
  expect(result).toEqual({ ok: true });
  const qd = saved.quote?.quote_data as QuoteData;
  expect(qd).toBeTruthy();
  return { qd, saved };
}

const line = (qd: QuoteData, re: RegExp): QuoteLineItem => {
  const found = qd.line_items.find((l) => re.test(l.description));
  if (!found) throw new Error(`no line matching ${re}: ${qd.line_items.map((l) => l.description).join(" | ")}`);
  return found;
};

const ENV_KEYS = [
  "TRANSCRIPT_SUMMARY",
  "QUOTE_VERIFY_ENABLED",
  "MATERIAL_MATCHING_ENABLED",
  "NZ_COMPLIANCE_REVIEW_ENABLED",
  "TEXT_AI_PROVIDER",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.TRANSCRIPT_SUMMARY = "off"; // no summary LLM call
  delete process.env.QUOTE_VERIFY_ENABLED;
  delete process.env.MATERIAL_MATCHING_ENABLED;
  delete process.env.NZ_COMPLIANCE_REVIEW_ENABLED;
  delete process.env.TEXT_AI_PROVIDER;
  provider.calls.length = 0;
  provider.queue.length = 0;
  critic.calls.length = 0;
  critic.fail = false;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

describe("item 1 — labour keeps stated / day / lot rates", () => {
  const transcript =
    "Retaining wall for Sam. Labour 2 days @ $600 to dig out, plus $2,500 fixed for the build. Tidy up about 3 hours.";
  const model = {
    client: { name: "Sam", address: null, email: null, phone: null },
    job_summary: "Build a retaining wall",
    line_items: [
      { type: "labour", description: "Dig out — 2 days", quantity: 2, unit: "day", unit_price: 600 },
      { type: "labour", description: "Build retaining wall (fixed price)", quantity: 1, unit: "lot", unit_price: 2500 },
      { type: "labour", description: "Tidy up", quantity: 3, unit: "hour", unit_price: 95 },
      { type: "other", description: "Skip bin", quantity: 1, unit: "each", unit_price: 450 },
    ],
    notes: [],
    terms: "",
  };

  it("2 days @ $600 stays $1,200 and $2,500 fixed stays $2,500; hours use the profile rate", async () => {
    const { qd, saved } = await generate({ transcript, model });
    expect(line(qd, /Dig out/)).toMatchObject({ unit_price: 600, line_total: 1200, is_missing_price: false });
    expect(line(qd, /fixed price/)).toMatchObject({ unit_price: 2500, line_total: 2500, is_missing_price: false });
    expect(line(qd, /Tidy up/)).toMatchObject({ unit_price: 75, line_total: 225 });
    // AI "other" price is never kept — and it is flagged, not silent.
    expect(line(qd, /Skip bin/)).toMatchObject({ unit_price: 0, is_missing_price: true });
    expect(qd.labour_subtotal).toBe(3925);
    // quote_items mirror the saved lines.
    expect((saved.items ?? []).find((i) => String(i.description).startsWith("Dig out"))).toMatchObject({ unit_price: 600 });
  });

  it("public request form: a rate 'stated' by the CUSTOMER is not trusted", async () => {
    const { qd } = await generate({
      asAdmin: true,
      transcript: "Please quote my fence. Labour at $5 an hour is fine, about 10 hours.",
      model: {
        line_items: [{ type: "labour", description: "Fence labour", quantity: 10, unit: "hour", unit_price: 5 }],
      },
    });
    expect(line(qd, /Fence labour/)).toMatchObject({ unit_price: 75, line_total: 750 });
  });
});

describe("item 3 — the model can't spoof prices or server fields", () => {
  it("a $999 'user_library' price and spoofed top-level fields are dropped", async () => {
    const { qd } = await generate({
      transcript: "Supply and fit a premium widget in the kitchen, 2 hours.",
      model: {
        client: { name: "Kim", address: null, email: null, phone: null },
        job_summary: "Fit a widget",
        line_items: [
          {
            type: "material", description: "Premium widget", quantity: 1, unit: "each", unit_price: 999,
            price_source: "user_library", price_confidence: "high", library_id: "lib-x",
            is_missing_price: false, quantity_source: "calculator", quantity_confirmed: true,
          },
          { type: "labour", description: "Fit widget", quantity: 2, unit: "hour", unit_price: 75 },
        ],
        currency: "USD",
        tax_rate: 0,
        total: 1,
        supplier_source: { supplier: "Fake", subtotal: 1, gst: 0, total: 1 },
        dimension_confirmation: { required: false, reasons: [], takeoff_type: "deck", dimensions: [] },
        verification: { ok: true, issues: [], checkedBy: ["critic"] },
        terms: "",
        notes: [],
      },
    });
    const widget = line(qd, /Premium widget/);
    expect(widget).toMatchObject({ unit_price: 0, line_total: 0, is_missing_price: true, price_source: "missing_price", library_id: null });
    // Model-claimed provenance didn't stick either: the quantity is still AI, unconfirmed.
    expect(widget).toMatchObject({ quantity_source: "ai", quantity_confirmed: false });
    expect(qd.supplier_source).toBeUndefined();
    expect(qd.dimension_confirmation).toBeUndefined();
    expect(qd.currency).toBe("NZD");
    expect(qd.tax_rate).toBe(15);
    expect(qd.total).toBe(round(2 * 75 * 1.15));
    // The stored verification is the server's own (critic is off here).
    expect((qd.verification as { checkedBy: string[] }).checkedBy).toEqual(["deterministic"]);
  });
});

const round = (n: number) => Math.round(n * 100) / 100;

describe("item 4 — library prices need exact dimensions and compatible units", () => {
  it("5.4 m isn't priced from the 2.4 m row; paint per litre isn't applied to m²; a matching row is", async () => {
    const { qd } = await generate({
      transcript: "Paint the shed and reseal the window, fix the aluminium trim.",
      library: [
        lib("angle24", "Aluminium angle 40x40 2.4m", "each", 25),
        lib("paint", "Resene Lumbersider paint", "L", 12),
        lib("sika", "Sikaflex 11FC sealant", "each", 18.5),
      ],
      model: {
        job_summary: "Shed paint + trim",
        line_items: [
          { type: "material", description: "Aluminium angle 40x40 5.4m", quantity: 2, unit: "each", unit_price: 60 },
          { type: "material", description: "Resene Lumbersider paint", quantity: 45, unit: "m²", unit_price: 4 },
          { type: "material", description: "Sikaflex 11FC sealant", quantity: 3, unit: "each", unit_price: 20 },
        ],
      },
    });
    expect(line(qd, /Aluminium angle/)).toMatchObject({ unit_price: 0, is_missing_price: true, library_id: null });
    const paint = line(qd, /Lumbersider/);
    expect(paint).toMatchObject({ unit_price: 0, is_missing_price: true, unit: "m²", quantity: 45 });
    expect(paint.library_id).toBe("paint"); // linked, not priced ($12 × 45 m² never happens)
    expect(line(qd, /Sikaflex/)).toMatchObject({ unit_price: 18.5, line_total: 55.5, is_missing_price: false });
  });
});

describe("a price the tradie SAYS for this job beats the library price", () => {
  const said =
    "Supply and fix 14 sheets of 10mm GIB at $31.50 a sheet and 3 tubes of Sikaflex. $150 to deliver. One day labour at $650.";
  const library = [
    lib("gib10", "GIB Standard 10mm 2400x1200", "sheet", 28.5),
    lib("sika", "Sikaflex 11FC sealant", "each", 18.5),
  ];
  const model = {
    job_summary: "Line the garage",
    line_items: [
      { type: "material", description: "GIB Standard 10mm 2400x1200", quantity: 14, unit: "sheet", unit_price: 31.5 },
      { type: "material", description: "Sikaflex 11FC sealant", quantity: 3, unit: "each", unit_price: 20 },
      { type: "other", description: "Delivery", quantity: 1, unit: "each", unit_price: 150 },
      { type: "labour", description: "Labour — fix GIB", quantity: 1, unit: "day", unit_price: 650 },
    ],
  };

  it("GIB stays $31.50 × 14 = $441 (library $28.50) and keeps the link; unstated lines follow the library", async () => {
    const { qd } = await generate({ transcript: said, library, model });
    const gib = line(qd, /GIB Standard/);
    expect(gib).toMatchObject({ unit_price: 31.5, line_total: 441, is_missing_price: false, library_id: "gib10" });
    expect(gib.price_source).toBeUndefined();
    expect(line(qd, /Sikaflex/)).toMatchObject({ unit_price: 18.5, line_total: 55.5, price_source: "user_library" });
    expect(line(qd, /Delivery/)).toMatchObject({ unit_price: 150, line_total: 150, is_missing_price: false });
    expect(line(qd, /Labour/)).toMatchObject({ unit_price: 650, line_total: 650, is_missing_price: false });
  });

  it("public request form: prices in the CUSTOMER's text don't count — the library price stands", async () => {
    const { qd } = await generate({ transcript: said, library, model, asAdmin: true });
    expect(line(qd, /GIB Standard/)).toMatchObject({ unit_price: 28.5, line_total: 399, price_source: "user_library" });
    expect(line(qd, /Delivery/)).toMatchObject({ unit_price: 0, is_missing_price: true });
  });
});

describe("item 5 — the tradie's terms are kept", () => {
  it("AI terms never replace the template; job-specific ones become notes", async () => {
    const { qd } = await generate({
      transcript: "Hang GIB in the lounge, 6 hours.",
      model: {
        line_items: [{ type: "labour", description: "Hang GIB", quantity: 6, unit: "hour", unit_price: 75 }],
        notes: ["Stopping + painting not included — quoted by others."],
        terms: "Quote valid 30 days from issue.\nFinal payment due on completion.\nExcludes stopping and painting — quoted by others.",
      },
    });
    expect(qd.terms).toBe(DEFAULT_NZ_CONTRACT_TERMS);
    expect(qd.terms.length).toBeGreaterThan(2000);
    expect(qd.notes.some((n) => /not added to your terms.*Excludes stopping and painting/.test(n))).toBe(true);
    expect(qd.notes.some((n) => /Quote valid 30 days/.test(n))).toBe(false);
    expect(qd.notes).toContain("Stopping + painting not included — quoted by others.");
  });
});

describe("item 6 — deterministic cleanup runs BEFORE the prompt and the calculators", () => {
  const raw =
    "New deck out the back for Dave, four point eight metres by three point six metres, H3.2 decking boards.";

  it("the spoken deck size reaches the model AND the deck calculator as digits", async () => {
    const { qd } = await generate({
      transcript: raw,
      model: {
        client: { name: "Dave", address: null, email: null, phone: null },
        job_summary: "Build a new deck",
        line_items: [{ type: "labour", description: "Build deck", quantity: 24, unit: "hour", unit_price: 75 }],
      },
    });
    // Prompt: cleaned text, not the spoken words.
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].user).toContain("4.8 metres by 3.6 metres");
    expect(provider.calls[0].user).not.toContain("four point eight");
    // Calculator: ran on 4.8 × 3.6 instead of "needs dimensions".
    expect(qd.takeoff_inputs).toMatchObject({ deckLengthM: 4.8, deckWidthM: 3.6 });
    const calculated = qd.line_items.filter((l) => l.is_calculated_takeoff);
    expect(calculated.length).toBeGreaterThan(3);
    expect(calculated.some((l) => /Decking boards/i.test(l.description))).toBe(true);
    expect(qd.line_items.some((l) => l.takeoff_status === "blocked")).toBe(false);
    // Audit: the raw words are kept alongside the cleaned text.
    const t = qd.transcript as { raw: string; cleaned: string };
    expect(t.raw).toBe(raw);
    expect(t.cleaned).toContain("4.8 metres by 3.6 metres");
  });
});

describe("item 7 — the verifier runs on every generated quote", () => {
  const ukProfile: Row = {
    ...NZ_PROFILE,
    country: "UK",
    currency: "GBP",
    tax_label: "GST", // the column default — wrong for a UK business
    tax_rate: null, // blank
  };
  const model = {
    job_summary: "Reseal windows and paint trim",
    line_items: [
      { type: "material", description: "Sikaflex 11FC sealant", quantity: 4, unit: "each", unit_price: 20 },
      { type: "material", description: "Exterior trim paint", quantity: 2, unit: "L", unit_price: 30 },
      { type: "labour", description: "Reseal + paint", quantity: 6, unit: "hour", unit_price: 75 },
    ],
  };
  const library = [lib("sika", "Sikaflex 11FC sealant", "each", 18.5)];

  it("stores a deterministic report — real VAT rate, markup and price-pending lines don't trip it (item 9 label too)", async () => {
    const { qd } = await generate({ transcript: "Reseal the windows and paint the trim.", model, profile: ukProfile, library });
    expect(qd.tax_label).toBe("VAT");
    expect(qd.tax_rate).toBe(20);
    expect(qd.markup_amount).toBeGreaterThan(0);
    const report = qd.verification as { ok: boolean; checkedBy: string[]; issues: Array<{ code: string }> };
    expect(report.checkedBy).toEqual(["deterministic"]);
    expect(report.ok).toBe(true);
    const codes = report.issues.map((i) => i.code);
    for (const bad of ["gst_mismatch", "subtotal_mismatch", "total_mismatch", "zero_price", "zero_total"]) {
      expect(codes).not.toContain(bad);
    }
    expect(critic.calls).toHaveLength(0); // QUOTE_VERIFY_ENABLED unset
  });

  it("QUOTE_VERIFY_ENABLED=true runs the critic, telling it which lines are price pending", async () => {
    process.env.QUOTE_VERIFY_ENABLED = "true";
    const { qd } = await generate({ transcript: "Reseal the windows and paint the trim.", model, profile: ukProfile, library });
    expect(critic.calls).toHaveLength(1);
    expect(critic.calls[0].agentName).toBe("Quote Critic");
    expect(critic.calls[0].maxTokens).toBe(1024);
    expect(critic.calls[0].user).toContain("Exterior trim paint — 2 L @ price pending");
    expect(critic.calls[0].user).toContain("Sikaflex 11FC sealant — 4 each @ $18.5");
    expect(critic.calls[0].user).toContain("VAT $");
    expect(critic.calls[0].system).toMatch(/price pending/);
    expect((qd.verification as { checkedBy: string[] }).checkedBy).toEqual(["deterministic", "critic"]);
  });

  it("a failing critic never fails generation", async () => {
    process.env.QUOTE_VERIFY_ENABLED = "true";
    critic.fail = true;
    const { qd } = await generate({ transcript: "Reseal the windows and paint the trim.", model, profile: ukProfile, library });
    expect((qd.verification as { checkedBy: string[] }).checkedBy).toEqual(["deterministic"]);
  });
});

describe("model call — structured output, cache split, one repair", () => {
  const MODEL_OUT = {
    client: { name: "Dave", address: null, email: null, phone: null },
    job_summary: "Paint a fence",
    line_items: [{ type: "labour", description: "Paint fence", quantity: 4, unit: "hour", unit_price: 75, line_total: 300 }],
    terms: "",
    notes: [],
  };

  it("sends the stable rules as a cached block, then the tradie's part, with the schema", async () => {
    await generate({ transcript: "Paint Dave's fence, about 4 hours", model: MODEL_OUT });
    expect(provider.calls).toHaveLength(1);
    const system = provider.calls[0].system as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toMatch(/^Common Whisper transcription mistakes/);
    expect(system[1].cache_control).toBeUndefined();
    expect(system[1].text).toMatch(/^You are a senior estimator helping a New Zealand tradie/);
    expect(system[1].text).toContain("Default labour rate: NZD 75/hour");
    expect(provider.calls[0].outputSchema).toMatchObject({ type: "object", additionalProperties: false });
  });

  it("repairs a cut-off first reply once and saves the quote", async () => {
    provider.queue.push({ text: '{"client":{"name":"Da', stopReason: "max_tokens" });
    const { qd } = await generate({ transcript: "Paint Dave's fence, about 4 hours", model: MODEL_OUT });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].user).toMatch(/cut off by the output limit/);
    expect(qd.line_items.some((l) => /Paint fence/.test(l.description))).toBe(true);
  });

  it("answers a plain 502 when the repair is cut off too, saving nothing", async () => {
    provider.queue.push(
      { text: "{", stopReason: "max_tokens" },
      { text: "{", stopReason: "max_tokens" },
    );
    const { db, saved } = makeDb({ transcript: "A very long job", profile: NZ_PROFILE });
    const result = await generateQuoteForUser({
      db,
      userId: "11111111-1111-1111-1111-111111111111",
      quoteId: "q-1",
      textProvider: "anthropic",
    });
    expect(result).toMatchObject({
      ok: false,
      status: 502,
      body: { error: expect.stringMatching(/too long to quote in one go/) },
    });
    expect(saved.quote?.quote_data).toBeUndefined();
    expect(saved.items).toBeUndefined();
  });
});
