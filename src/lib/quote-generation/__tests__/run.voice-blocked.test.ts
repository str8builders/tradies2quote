import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { QuoteData } from "@/lib/quote-types";

/**
 * Audit item 2 — a VOICE quote for a calculator job (a lined wall, a deck,
 * cladding, a subfloor) whose size is missing or can't be right used to fall
 * back to the AI's own material lines: the model invented the GIB sheet and
 * stud counts. Drawings already stripped those. Now voice behaves the same:
 * no AI quantities for that scope, one blocked line saying exactly which size
 * is needed. Jobs with no calculator keep their AI lines.
 *
 * Runs the REAL pipeline (`generateQuoteForUser`) with the quote model mocked
 * and an in-memory Supabase stub that records what would be saved.
 */

const provider = vi.hoisted(() => ({ output: {} as unknown }));
vi.mock("@/lib/llm/anthropic-quote", () => ({
  ANTHROPIC_QUOTE_MAX_TOKENS: 16384,
  runAnthropicQuoteCompletion: async () => ({
    text: JSON.stringify(provider.output),
    model: "mock",
    stopReason: "end_turn",
  }),
}));
vi.mock("@/lib/agents/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/runtime")>();
  return {
    ...actual,
    runStructuredAgent: async () => ({
      value: { scopeCovered: true, issues: [] },
      model: "mock",
      attempts: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    }),
  };
});
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { generateQuoteForUser } from "../run";

type Row = Record<string, unknown>;

function makeDb(transcript: string) {
  const saved: { quote?: Row } = {};
  const quoteRow = { id: "q-1", voice_transcript: transcript, quote_data: null };
  const profile = {
    business_name: "Test Builders",
    country: "NZ",
    default_labour_rate: 75,
    default_markup_pct: 20,
    tax_label: "GST",
    tax_rate: 15,
    currency: "NZD",
  };
  function from(table: string) {
    let op: "select" | "update" | "insert" | "delete" = "select";
    let payload: unknown = null;
    let cols = "";
    const result = () => {
      if (op === "update" && table === "quotes") saved.quote = payload as Row;
      if (op !== "select") return { data: null, error: null };
      if (table === "quotes" && cols.includes("voice_transcript")) return { data: quoteRow, error: null };
      if (table === "profiles") return { data: profile, error: null };
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

async function generate(transcript: string, model: unknown): Promise<QuoteData> {
  provider.output = model;
  const { db, saved } = makeDb(transcript);
  const result = await generateQuoteForUser({
    db,
    userId: "11111111-1111-1111-1111-111111111111",
    quoteId: "q-1",
    textProvider: "anthropic",
  });
  expect(result).toEqual({ ok: true });
  return saved.quote?.quote_data as QuoteData;
}

/** "<scope> takeoff — needs dimensions…" lines (the calculator's own blocked
 *  insulation line — exterior-only rule — is a different, existing thing). */
const blocked = (qd: QuoteData) =>
  qd.line_items.filter((l) => l.takeoff_status === "blocked" && / takeoff — /.test(l.description));
const described = (qd: QuoteData, re: RegExp) => qd.line_items.filter((l) => re.test(l.description));

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  savedEnv.TRANSCRIPT_SUMMARY = process.env.TRANSCRIPT_SUMMARY;
  process.env.TRANSCRIPT_SUMMARY = "off";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  if (savedEnv.TRANSCRIPT_SUMMARY === undefined) delete process.env.TRANSCRIPT_SUMMARY;
  else process.env.TRANSCRIPT_SUMMARY = savedEnv.TRANSCRIPT_SUMMARY;
  vi.restoreAllMocks();
});

const WALL_MODEL = {
  client: { name: "Kim", address: null, email: null, phone: null },
  job_summary: "Line the lounge wall",
  line_items: [
    { type: "material", description: "10mm GIB Board 2400x1200", quantity: 20, unit: "sheets", unit_price: 30 },
    { type: "material", description: "90x45 SG8 studs", quantity: 30, unit: "lengths", unit_price: 12 },
    { type: "material", description: "Resene interior paint", quantity: 4, unit: "L", unit_price: 40 },
    { type: "labour", description: "Frame and line wall", quantity: 16, unit: "hour", unit_price: 75 },
  ],
  notes: [],
  terms: "",
};

describe("voice: a calculator job with a size that can't be right", () => {
  it("'24 high' wall: no AI GIB/stud counts (were kept: 20 sheets, 30 studs), one blocked line naming the height", async () => {
    const qd = await generate("GIB both sides on a 10m wall, 24 high. Paint it after.", WALL_MODEL);
    expect(described(qd, /GIB Board/)).toEqual([]);
    expect(described(qd, /studs/)).toEqual([]);
    const b = blocked(qd);
    expect(b).toHaveLength(1);
    expect(b[0].description).toMatch(/^wall takeoff/);
    expect(b[0].quantity).toBe(0);
    expect(b[0].takeoff_flags?.join(" ")).toMatch(/Wall height "24" reads as 24 m.*Say the right size or type it\./);
    // No calculator for paint or labour: the AI lines stay.
    expect(described(qd, /paint/i)).toHaveLength(1);
    expect(described(qd, /Frame and line wall/)).toHaveLength(1);
    // The dropped AI lines are named, never silent.
    expect(qd.notes.join(" ")).toMatch(/Left out 2 AI-estimated material line\(s\).*10mm GIB Board/);
  });
});

describe("voice: a calculator job with a size missing", () => {
  it("'Hang GIB in the lounge': blocked line asks for the wall length and GIB sides (AI's 20 sheets dropped)", async () => {
    const qd = await generate("Hang GIB in the lounge, about 16 hours.", WALL_MODEL);
    expect(described(qd, /GIB Board/)).toEqual([]);
    const flags = blocked(qd)[0]?.takeoff_flags ?? [];
    expect(flags).toContain("Wall length needed — say it or type it.");
    expect(flags).toContain("GIB one side or both sides? Say it or type it.");
  });

  it("'Build a new deck' with no size: blocked deck line, the AI's joist count dropped", async () => {
    const qd = await generate("Build a new deck out the back for Dave.", {
      line_items: [
        { type: "material", description: "Deck joists 140x45 H3.2", quantity: 20, unit: "lengths", unit_price: 25 },
        { type: "labour", description: "Build deck", quantity: 24, unit: "hour", unit_price: 75 },
      ],
    });
    expect(described(qd, /Deck joists/)).toEqual([]);
    const b = blocked(qd);
    expect(b).toHaveLength(1);
    expect(b[0].description).toMatch(/^deck takeoff/);
    expect(b[0].takeoff_flags).toContain("Deck length and width needed — say them or type them.");
  });
});

describe("voice: the tradie's own counts need no sizes", () => {
  it("'14 sheets of GIB and 2 boxes of screws': no blocked line, the counted lines stay (quantities still to confirm)", async () => {
    const qd = await generate(
      "Supply and fix 14 sheets of 10mm GIB at $31.50 a sheet and 2 boxes of GIB screws at $35 a box. One day labour at $650.",
      {
        client: { name: "Kim", address: null, email: null, phone: null },
        job_summary: "Supply and fix GIB",
        line_items: [
          { type: "material", description: "10mm GIB Board 2400x1200", quantity: 14, unit: "sheets", unit_price: 31.5 },
          { type: "material", description: "GIB screws", quantity: 2, unit: "box", unit_price: 35 },
          { type: "labour", description: "Fix GIB", quantity: 1, unit: "day", unit_price: 650 },
        ],
        notes: [],
        terms: "",
      },
    );
    expect(blocked(qd)).toEqual([]);
    expect(described(qd, /GIB Board/)).toMatchObject([{ quantity: 14, unit_price: 31.5, line_total: 441, quantity_confirmed: false }]);
    expect(described(qd, /screws/)).toMatchObject([{ quantity: 2, unit_price: 35, line_total: 70 }]);
    expect(qd.notes.join(" ")).not.toMatch(/Left out/);
  });

  it("a count the model made up ('Hang GIB', 20 sheets never said) is still blocked", async () => {
    const qd = await generate("Hang GIB in the lounge, 2 boxes of screws, about 16 hours.", WALL_MODEL);
    expect(described(qd, /GIB Board/)).toEqual([]);
    expect(blocked(qd)).toHaveLength(1);
  });
});

describe("voice: no false alarms for jobs that aren't calculator takeoffs", () => {
  it("a retaining wall (the word 'wall', no lining/framing) gets no blocked line", async () => {
    const qd = await generate("Retaining wall for Sam. Labour 2 days @ $600 to dig out.", {
      line_items: [{ type: "labour", description: "Dig out", quantity: 2, unit: "day", unit_price: 600 }],
    });
    expect(blocked(qd)).toEqual([]);
  });

  it("painting walls with sizes keeps the AI paint lines and gets no blocked line", async () => {
    const qd = await generate("Paint the lounge walls, 4 walls 3.6m long 2.4m high, two coats.", {
      line_items: [
        { type: "material", description: "Resene interior paint", quantity: 8, unit: "L", unit_price: 40 },
        { type: "labour", description: "Paint lounge", quantity: 10, unit: "hour", unit_price: 75 },
      ],
    });
    expect(blocked(qd)).toEqual([]);
    expect(described(qd, /paint/i)).toHaveLength(2);
  });

  it("staining a deck is not a deck build — no blocked line", async () => {
    const qd = await generate("Stain the deck, two coats of oil.", {
      line_items: [
        { type: "material", description: "Deck oil", quantity: 10, unit: "L", unit_price: 30 },
        { type: "labour", description: "Stain deck", quantity: 6, unit: "hour", unit_price: 75 },
      ],
    });
    expect(blocked(qd)).toEqual([]);
    expect(described(qd, /Deck oil/)).toHaveLength(1);
  });

  it("a voice calculator job WITH its sizes still runs the calculator (no blocked line)", async () => {
    const qd = await generate("GIB both sides on a 10m wall, 2.4m high.", WALL_MODEL);
    expect(blocked(qd)).toEqual([]);
    expect(qd.line_items.some((l) => l.is_calculated_takeoff && /GIB/.test(l.description))).toBe(true);
  });
});

describe("labour that can't be right is flagged at generation (audit item 3)", () => {
  it("40 hours on a '2 day job' puts a check-this note on the quote (was silent)", async () => {
    const qd = await generate("Replace the hot water cylinder, it's a 2 day job.", {
      line_items: [{ type: "labour", description: "Install cylinder", quantity: 40, unit: "hour", unit_price: 75 }],
    });
    // The quantity is left exactly as it was — only flagged.
    expect(described(qd, /Install cylinder/)[0]).toMatchObject({ quantity: 40 });
    expect(qd.notes[0]).toBe(
      "Labour adds up to 40 hours, but the job was described as 2 days — that's more than 12 hours a day. Check the labour hours.",
    );
  });
});
