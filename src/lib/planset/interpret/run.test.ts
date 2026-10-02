import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { AiError } from "@/lib/ai/errors";
import type { BuildingModel } from "../model/types";
import type { SheetFacts } from "../sheetFacts";
import type { Register } from "../sheet/register";
import { EMPTY_READING } from "./schema";

const captureError = vi.fn();
vi.mock("@/lib/observability", () => ({ captureError: (...a: unknown[]) => captureError(...a) }));
const readSheetResilient = vi.fn();
vi.mock("./resilient", async (orig) => ({ ...(await orig<typeof import("./resilient")>()), readSheetResilient: (...a: unknown[]) => readSheetResilient(...a) }));

import { cleanPagesPdf, interpretPlanSet } from "./run";

const model: BuildingModel = {
  version: 1,
  project: { kind: "new_build", buildings: [], consentNumber: null, authority: null, approved: true, consentSource: "papers" },
  sheets: { total: 4, drawings: 4, documents: 0, provenScale: 0, unreadable: 0 },
  walls: null,
  wallsByBuilding: {},
  openings: [],
  lintels: [],
  schedules: {},
  specs: {},
  heights: { studMm: null, ceilingMm: null },
  roof: { pitchDeg: null, areaM2: null, material: null },
  zones: { wind: null, earthquake: null, exposure: null, snow: null },
  consent: { inspections: [], documents: [], conditions: [] },
  rooms: [],
  legend: [],
  byOthers: [],
  ai: { sheetsRead: 0, itemsKept: 0, itemsDropped: 0, skipped: null },
  flags: [],
};

const facts = (pages: number[], kind = "notes"): SheetFacts[] =>
  pages.map((page) => ({ page, kind, document: false, unreadable: false, title: { sheetId: `A${page}`, title: "Notes" }, text: [{ id: 1, s: "Linea weatherboard", x: 10, y: 10, angle: 0, h: 3, w: 30 }] }) as unknown as SheetFacts);

async function blankPdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return new Uint8Array(await doc.save());
}

const ok = (rung = "full") => ({ reading: EMPTY_READING, json: null, usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }, truncated: false, model: "claude-opus-5-5", rung });
const bad = (detail: string) => new AiError({ kind: "bad_request", provider: "anthropic", status: 400, detail });
const run = async (pages: number[], pdfPages = 4) =>
  interpretPlanSet({ facts: facts(pages), pdf: await blankPdf(pdfPages), model, register: {} as Register });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.PLAN_SET_AI;
  captureError.mockReset();
  readSheetResilient.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("interpretPlanSet — when the AI service turns sheets down", () => {
  it("reads every sheet and adds no flag when all goes through", async () => {
    readSheetResilient.mockResolvedValue(ok());
    const r = await run([1, 2, 3, 4]);
    expect(readSheetResilient).toHaveBeenCalledTimes(4);
    expect(r.model.ai.sheetsRead).toBe(4);
    expect(r.model.flags).toEqual([]);
    expect(r.usage).toMatchObject({ sheets: 4, failures: 0, stoppedBy: null, steppedDown: { again: 0, plain: 0, clean: 0, text: 0 } });
    expect(captureError).not.toHaveBeenCalled();
  });

  it("an empty account stops the run after the sheets already under way, logs once, and says why", async () => {
    readSheetResilient.mockRejectedValue(bad("invalid_request_error: Your credit balance is too low to access the Anthropic API."));
    const r = await run([1, 2, 3, 4]);
    expect(readSheetResilient.mock.calls.length).toBeLessThanOrEqual(2);
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError.mock.calls[0][1]).toMatchObject({ route: "plansets/interpret", extra: { why: "account" } });
    const flag = r.model.flags.find((f) => f.id === "ai-halted")!;
    expect(flag.message).toMatch(/stopped early.*isn't available on this account/);
    expect(flag.message).toMatch(/0 sheets were read first, 4 were not/);
    expect(r.model.flags.find((f) => f.id === "ai-failures")).toBeUndefined();
    expect(r.usage).toMatchObject({ stoppedBy: "account" });
    expect(r.model.ai.sheetsRead).toBe(0);
  });

  it("a sheet read from its words only is flagged, and counted", async () => {
    readSheetResilient.mockResolvedValueOnce(ok("text")).mockResolvedValue(ok());
    const r = await run([1, 2, 3]);
    expect(r.model.flags.find((f) => f.id === "ai-words-only")!.message).toMatch(/^1 sheet was read from the printed text alone/);
    expect(r.usage).toMatchObject({ sheets: 3, failures: 0, steppedDown: { text: 1 } });
  });

  it("sheets the service wouldn't take at all are named by reason, and the rest are still read", async () => {
    readSheetResilient
      .mockRejectedValueOnce(bad("invalid_request_error: The PDF specified was not valid."))
      .mockRejectedValueOnce(new AiError({ kind: "timeout", provider: "anthropic" }))
      .mockResolvedValue(ok());
    const r = await run([1, 2, 3, 4]);
    expect(r.model.ai.sheetsRead).toBe(2);
    const flag = r.model.flags.find((f) => f.id === "ai-failures")!;
    expect(flag.message).toMatch(/^2 sheets couldn't be read by the AI this time \(/);
    expect(flag.message).toContain("couldn't open the page");
    expect(flag.message).toContain("didn't answer properly");
    expect(captureError).toHaveBeenCalledTimes(2);
  });

  it("a page that can't be cut out of the set goes on as words only", async () => {
    readSheetResilient.mockResolvedValue(ok("text"));
    await run([1, 9], 1); // page 9 isn't in a one-page set
    const pdfs = readSheetResilient.mock.calls.map((c) => (c[0] as { pdf: Uint8Array | null }).pdf);
    expect(pdfs.filter((p) => p === null)).toHaveLength(1);
    expect(pdfs.filter((p) => p instanceof Uint8Array)).toHaveLength(1);
    const withWords = readSheetResilient.mock.calls.map((c) => c[0] as { textPrompt: string });
    expect(withWords[0].textPrompt).toContain("The page itself is not attached");
  });
});

describe("cleanPagesPdf", () => {
  it("keeps what the page needs and leaves annotations, thumbnails and the like behind", async () => {
    const { PDFName, PDFString } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.node.set(PDFName.of("Thumb"), PDFString.of("x"));
    page.node.set(PDFName.of("Annots"), doc.context.obj([]));
    page.node.set(PDFName.of("StructParents"), doc.context.obj(3));
    const src = await PDFDocument.load(await doc.save());
    const out = await PDFDocument.load(await cleanPagesPdf(src, [1]));
    expect(out.getPageCount()).toBe(1);
    const keys = out.getPage(0).node.keys().map((k) => k.decodeText());
    expect(keys).toEqual(expect.arrayContaining(["Type", "MediaBox", "Resources"]));
    expect(keys).not.toContain("Thumb");
    expect(keys).not.toContain("Annots");
    expect(keys).not.toContain("StructParents");
    expect(out.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  });
});
