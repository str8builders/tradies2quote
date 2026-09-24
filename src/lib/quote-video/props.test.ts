import { describe, expect, it } from "vitest";
import {
  allowedLogoUrl,
  buildQuoteVideoProps,
  cleanText,
  clientDisplayName,
  jobLine,
  keyItems,
  truncateWords,
  type QuoteVideoQuoteInput,
} from "./props";
import { SAMPLE_PROFILE, SAMPLE_QUOTE, sampleQuoteVideoProps } from "./sample";

const SUPABASE = "https://api.tradies2quote.com";
const LOGO = `${SUPABASE}/storage/v1/object/public/business-logos/0f7f4f6e-1111-4222-8333-944444444444/1726000000.png`;

function quote(data: Record<string, unknown>, extra: Partial<QuoteVideoQuoteInput> = {}): QuoteVideoQuoteInput {
  return { quote_data: data, total_amount: 115, currency: "NZD", expires_at: null, ...extra };
}

describe("clientDisplayName — first name only", () => {
  it.each([
    ["Sam Taylor", "Sam"],
    ["  sam   taylor ", "Sam"],
    ["SAM TAYLOR", "Sam"],
    ["Sam", "Sam"],
    ["Dr Jane Doe", "Jane"],
    ["Mrs. Aroha Ngata", "Aroha"],
    ["Tāne Mahuta", "Tāne"],
    ["TĀNE MAHUTA", "Tāne"],
    ["JEAN-LUC PICARD", "Jean-Luc"],
    ["o'neil", "O'Neil"],
    ["McKay Smith", "McKay"],
    ["Sam & Alex Taylor", "Sam & Alex"],
    ["sam and alex taylor", "Sam & Alex"],
    ["Mrs Ngata", "Mrs Ngata"],
    ["Mr & Mrs Smith", "Mr & Mrs Smith"],
    ["Kauri Homes Ltd", "Kauri Homes Ltd"],
    ["Bay of Plenty Regional Council", "Bay of Plenty Regional Council"],
    ["Sam 🔨 Taylor", "Sam"],
    ["To be confirmed", null],
    ["TBC", null],
    ["", null],
    ["   ", null],
    ["123 Main", null],
    [null, null],
    [42, null],
  ])("%j → %j", (input, expected) => {
    expect(clientDisplayName(input)).toBe(expected);
  });

  it("never passes a surname through for a person", () => {
    for (const name of ["Sam Taylor", "Dr Jane Doe", "Sam & Alex Taylor"]) {
      expect(clientDisplayName(name)).not.toMatch(/Taylor|Doe/);
    }
  });
});

describe("jobLine — the job in one line", () => {
  it.each([
    ["New kwila deck at 14 Rata St. Includes steps and a handrail.", "New kwila deck at 14 Rata St"],
    ["Re-roof the garage\nStrip old iron, new underlay", "Re-roof the garage"],
    ["\n\n  Paint the fence!  ", "Paint the fence"],
    [
      "Replace all exterior weatherboards, re-flash every window and repaint the whole house",
      "Replace all exterior weatherboards, re-flash every…",
    ],
    ["", null],
    ["   ", null],
    [null, null],
  ])("%j → %j", (input, expected) => {
    expect(jobLine(input)).toBe(expected);
  });
});

describe("keyItems — top lines by amount", () => {
  const lines = [
    { type: "material", description: "Decking", line_total: 1200 },
    { type: "labour", description: "Build", line_total: 1600 },
    { type: "material", description: "Fixings", line_total: 0 },
    { type: "other", description: "Skip bin", line_total: 350 },
    { type: "material", description: "Stain", line_total: 0.004 },
    { type: "labour", description: "Tidy up", line_total: 90 },
    { type: "material", description: "Discount", line_total: -50 },
    { type: "material", description: "Piles", line_total: "520.50" },
    { type: "material", description: "Broken", line_total: "abc" },
  ];

  it("ranks labour, materials and other costs together, largest first, skipping $0 lines", () => {
    expect(keyItems(lines, "NZD")).toEqual({
      items: [
        { label: "Build", amount: "$1,600.00" },
        { label: "Decking", amount: "$1,200.00" },
        { label: "Piles", amount: "$520.50" },
        { label: "Skip bin", amount: "$350.00" },
      ],
      moreItems: 1,
    });
  });

  it.each([
    ["GBP", "£1,600.00"],
    ["AUD", "$1,600.00"],
    ["EUR", "€1,600.00"],
  ])("formats amounts in %s", (currency, amount) => {
    expect(keyItems(lines, currency).items[0].amount).toBe(amount);
  });

  it("keeps quote order for equal amounts and labels untitled lines by type", () => {
    const result = keyItems(
      [
        { type: "labour", description: "", line_total: 100 },
        { type: "material", description: "Second", line_total: 100 },
        { type: "other", line_total: 100 },
      ],
      "NZD",
    );
    expect(result.items.map((i) => i.label)).toEqual(["Labour", "Second", "Other costs"]);
  });

  it("copes with missing or malformed line items", () => {
    expect(keyItems(undefined, "NZD")).toEqual({ items: [], moreItems: 0 });
    expect(keyItems([null, "x", 3], "NZD")).toEqual({ items: [], moreItems: 0 });
  });

  it("shortens long descriptions at a word boundary", () => {
    const long = "Supply and install premium H3.2 treated pine weatherboards with primer and all flashings";
    const [item] = keyItems([{ type: "material", description: long, line_total: 10 }], "NZD").items;
    expect(item.label.length).toBeLessThanOrEqual(64);
    expect(item.label.endsWith("…")).toBe(true);
  });
});

describe("allowedLogoUrl — our business-logos bucket only", () => {
  it.each([
    [LOGO, LOGO],
    [`${LOGO}?t=2`, `${LOGO}?t=2`],
    ["https://evil.example/storage/v1/object/public/business-logos/x.png", null],
    [`${SUPABASE}/storage/v1/object/public/quote-pdfs/x.pdf`, null],
    [`${SUPABASE}/storage/v1/object/sign/business-logos/x.png`, null],
    ["http://127.0.0.1:3001/api/health", null],
    [`https://user:pass@api.tradies2quote.com/storage/v1/object/public/business-logos/x.png`, null],
    ["data:image/png;base64,AAAA", null],
    ["not a url", null],
    [null, null],
  ])("%j → %j", (input, expected) => {
    expect(allowedLogoUrl(input, SUPABASE)).toBe(expected);
  });

  it("refuses every logo when the Supabase URL is unknown", () => {
    expect(allowedLogoUrl(LOGO, null)).toBeNull();
    expect(allowedLogoUrl(LOGO, "not a url")).toBeNull();
  });

  it("follows a Supabase URL served under a path", () => {
    const base = "https://example.test/supabase";
    expect(allowedLogoUrl(`${base}/storage/v1/object/public/business-logos/u/l.png`, base)).toBe(
      `${base}/storage/v1/object/public/business-logos/u/l.png`,
    );
    expect(allowedLogoUrl("https://example.test/storage/v1/object/public/business-logos/u/l.png", base)).toBeNull();
  });
});

describe("buildQuoteVideoProps", () => {
  it("builds the sample quote", () => {
    expect(buildQuoteVideoProps(SAMPLE_QUOTE, { ...SAMPLE_PROFILE!, logo_url: LOGO }, { supabaseUrl: SUPABASE })).toEqual({
      businessName: "Taylor Carpentry",
      logoSrc: LOGO,
      logoAspect: null,
      clientName: "Sam",
      jobLine: "New kwila deck at 14 Rata St",
      items: [
        { label: "Kwila decking and stainless fixings", amount: "$1,780.00" },
        { label: "Build the deck (2 builders, 2 days)", amount: "$1,560.00" },
        { label: "Piles, bearers and joists (H4/H3.2)", amount: "$520.00" },
        { label: "Steps and handrail", amount: "$220.00" },
      ],
      moreItems: 1,
      total: { value: 4830, text: "$4,830.00", currency: "NZD" },
      taxNote: "incl. GST",
      validUntil: "24 Oct 2026",
    });
  });

  it("uses the quote's total and currency columns first, as the client's quote link does", () => {
    const props = buildQuoteVideoProps(
      quote({ total: 999, currency: "NZD", tax_rate: 20, tax_label: "VAT" }, { total_amount: 1234.5, currency: "GBP" }),
      null,
    );
    expect(props.total).toEqual({ value: 1234.5, text: "£1,234.50", currency: "GBP" });
    expect(props.taxNote).toBe("incl. VAT");
  });

  it.each([
    [{ currency: "AUD", tax_rate: 10, tax_label: "GST" }, { total_amount: "2000.10", currency: null }, "$2,000.10", "incl. GST"],
    [{ total: 55, tax_rate: 0, tax_label: "Tax" }, { total_amount: null, currency: "USD" }, "$55.00", null],
    [{ tax_rate: 15, tax_label: "" }, { currency: "NZD" }, "$115.00", "incl. GST"],
    [{ tax_rate: 20 }, { currency: "GBP" }, "£115.00", "incl. VAT"],
    [{ tax_rate: "15", tax_label: "HST" }, { currency: "CAD" }, "$115.00", "incl. HST"],
    [{}, { total_amount: null, currency: "nzd$" }, "$0.00", null],
  ])("total and tax label for %j", (data, extra, text, taxNote) => {
    const props = buildQuoteVideoProps(quote(data, extra as Partial<QuoteVideoQuoteInput>), null);
    expect(props.total.text).toBe(text);
    expect(props.taxNote).toBe(taxNote);
  });

  it.each([
    ["2026-10-24T02:00:00.000Z", "24 Oct 2026"],
    // Late evening UTC is already the next day in New Zealand.
    ["2026-10-24T12:30:00.000Z", "25 Oct 2026"],
    ["not a date", null],
    [null, null],
  ])("valid-until %j → %j (New Zealand date)", (expires, expected) => {
    expect(buildQuoteVideoProps(quote({}, { expires_at: expires }), null).validUntil).toBe(expected);
  });

  it("falls back safely for an empty quote and profile", () => {
    expect(buildQuoteVideoProps({ quote_data: null, total_amount: null, currency: null, expires_at: null }, null)).toEqual({
      businessName: "Your tradie",
      logoSrc: null,
      logoAspect: null,
      clientName: null,
      jobLine: null,
      items: [],
      moreItems: 0,
      total: { value: 0, text: "$0.00", currency: "NZD" },
      taxNote: null,
      validUntil: null,
    });
  });

  it("drops a logo that is not on our storage and cleans the business name", () => {
    const props = buildQuoteVideoProps(quote({}), {
      business_name: "  Kōwhai\u0000 Plumbing 🔧 ",
      logo_url: "https://evil.example/logo.png",
    }, { supabaseUrl: SUPABASE });
    expect(props.businessName).toBe("Kōwhai Plumbing");
    expect(props.logoSrc).toBeNull();
  });

  it("is deterministic", () => {
    expect(buildQuoteVideoProps(SAMPLE_QUOTE, SAMPLE_PROFILE)).toEqual(buildQuoteVideoProps(SAMPLE_QUOTE, SAMPLE_PROFILE));
    expect(sampleQuoteVideoProps().logoSrc).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe("text helpers", () => {
  it.each([
    ["a\u0007b", "a b"],
    ["line\nbreak\ttab", "line break tab"],
    ["flag 🇳🇿 and 👍🏽 thumbs", "flag and thumbs"],
    // A combining macron (as some keyboards type it) becomes the precomposed \u0101.
    ["Ta\u0304ne", "T\u0101ne"],
  ])("cleanText(%j) → %j", (input, expected) => {
    expect(cleanText(input)).toBe(expected);
  });

  it("truncates at a word boundary", () => {
    expect(truncateWords("short", 10)).toBe("short");
    expect(truncateWords("one two three four", 12)).toBe("one two…");
    expect(truncateWords("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefghi…");
  });
});
