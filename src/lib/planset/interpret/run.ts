import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the AI reading of the sheets whose WORDS matter:
// notes and specifications, sections, the roof and site plans, the floor
// plan's legend and finishes, and the consent papers (bundled into one
// read). Each sheet goes as its own one-page PDF with its numbered text
// runs; answers are verified against that text before they're merged.
// A sheet that fails is reported, never fatal.
// ─────────────────────────────────────────────────────────────────────────

import { PDFDocument } from "pdf-lib";
import { captureError } from "@/lib/observability";
import type { AiUsage } from "@/lib/ai/anthropic";
import type { Evidence, TextItem } from "../types";
import type { SheetFacts } from "../sheetFacts";
import type { SheetKind } from "../sheet/classify";
import type { Register } from "../sheet/register";
import type { BuildingModel } from "../model/types";
import { readSheetWithAi } from "./call";
import { aiModel } from "@/lib/ai/models";
import { SCAN_READING_SCHEMA, SCAN_SYSTEM_PROMPT, agreeScans, parseScan, scanPrompt, type ScanOpening, type ScanSheet } from "./scan";
import type { Fact, ModelOpening } from "../model/types";
import { sheetPrompt } from "./prompt";
import { verifyReading } from "./verify";
import { mergeReadings, type SheetReadingAt } from "./merge";

/** Which sheets are worth an AI read, most useful first. */
const PRIORITY: SheetKind[] = ["notes", "specification", "sections", "structural_notes", "roof_plan", "floor_plan", "site_plan", "wet_areas", "elevations", "cover"];
/** Most drawing sheets read per set (cost cap). */
export const MAX_AI_SHEETS = 14;
/** Consent papers bundled into one read. */
const MAX_DOC_PAGES = 12;
/** Scanned / photographed pages read twice (cost cap). */
export const MAX_SCAN_PAGES = 12;

// Claude Opus 5.5 list prices, US$ per million tokens.
const USD_IN = 4, USD_OUT = 20;

export type InterpretInput = { facts: readonly SheetFacts[]; pdf: Uint8Array; model: BuildingModel; register: Register };
export type InterpretResult = {
  model: BuildingModel;
  usage: Record<string, unknown>;
  /** What scanned pages say they are (sheet number and title), by page. */
  sheetTitles: Record<number, ScanSheet>;
};

export function pickSheets(facts: readonly SheetFacts[]): { drawings: SheetFacts[]; documents: SheetFacts[]; scans: SheetFacts[] } {
  const drawings = facts
    .filter((f) => !f.document && !f.unreadable && PRIORITY.includes(f.kind))
    .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.page - b.page);
  // At most two floor plans and two elevation sheets: they repeat each other.
  const capped: SheetFacts[] = [];
  const perKind = new Map<SheetKind, number>();
  for (const f of drawings) {
    const n = perKind.get(f.kind) ?? 0;
    if ((f.kind === "floor_plan" || f.kind === "elevations") && n >= 2) continue;
    perKind.set(f.kind, n + 1);
    capped.push(f);
  }
  return {
    drawings: capped.slice(0, MAX_AI_SHEETS),
    documents: facts.filter((f) => f.document && !f.unreadable).slice(0, MAX_DOC_PAGES),
    // No text layer (a scan, a photo, text saved as shapes): read twice instead.
    scans: facts.filter((f) => f.unreadable).slice(0, MAX_SCAN_PAGES),
  };
}

/** Scheduled windows/doors read off a scanned schedule, unless a text schedule already gave them. */
export function addScanOpenings(model: BuildingModel, rows: ReadonlyArray<ScanOpening & { page: number }>): BuildingModel {
  const openings = [...model.openings];
  for (const r of rows) {
    if (openings.some((o) => o.mark === r.mark)) continue;
    const o: ModelOpening = {
      mark: r.mark,
      kind: r.kind,
      widthMm: r.width_mm,
      heightMm: r.height_mm,
      sillMm: null,
      headMm: null,
      count: r.count,
      fields: {},
      schedulePage: r.page,
      planPage: null,
      wall: null,
      lintel: null,
      sizeCheck: "unchecked",
      evidence: [{ page: r.page, method: "ai" }],
    };
    openings.push(o);
  }
  return { ...model, openings };
}

/** Facts that came only from scanned pages are marked for checking. */
export function markScanned(model: BuildingModel, scanned: ReadonlySet<number>): BuildingModel {
  if (!scanned.size) return model;
  const note = "Read from a scanned page (two AI reads agreed) — check it on the plan.";
  const mark = <T>(f: Fact<T> | null): Fact<T> | null =>
    f && f.status !== "tradie" && f.evidence.length && f.evidence.every((e) => scanned.has(e.page)) ? { ...f, status: "needs_check", note } : f;
  const markAll = <T>(list: Fact<T>[]) => list.map((f) => mark(f)!);
  return {
    ...model,
    specs: Object.fromEntries(Object.entries(model.specs).map(([k, v]) => [k, markAll(v)])),
    heights: { studMm: mark(model.heights.studMm), ceilingMm: mark(model.heights.ceilingMm) },
    roof: { ...model.roof, pitchDeg: mark(model.roof.pitchDeg), material: mark(model.roof.material) },
    zones: { wind: mark(model.zones.wind), earthquake: mark(model.zones.earthquake), exposure: mark(model.zones.exposure), snow: mark(model.zones.snow) },
    consent: { inspections: markAll(model.consent.inspections), documents: markAll(model.consent.documents), conditions: markAll(model.consent.conditions) },
    byOthers: markAll(model.byOthers),
  };
}

async function pagesPdf(src: PDFDocument, pages: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  for (const p of copied) out.addPage(p);
  return out.save();
}

export async function interpretPlanSet(input: InterpretInput): Promise<InterpretResult> {
  const skip = (reason: string): InterpretResult => ({
    model: {
      ...input.model,
      ai: { ...input.model.ai, skipped: reason },
      flags: [...input.model.flags, { id: "ai-skipped", level: "info", topic: "other", message: `Notes, sections, scans and consent papers weren't read: ${reason}`, evidence: [] }],
    },
    usage: { skipped: reason },
    sheetTitles: {},
  });
  if (process.env.PLAN_SET_AI === "off") return skip("the AI reading is switched off.");
  if (!process.env.ANTHROPIC_API_KEY) return skip("no AI key on this server.");

  const { drawings, documents, scans } = pickSheets(input.facts);
  const src = await PDFDocument.load(input.pdf, { ignoreEncryption: true, updateMetadata: false });
  const readings: SheetReadingAt[] = [];
  let kept = 0, dropped = 0, inTok = 0, outTok = 0, failures = 0;
  const addUsage = (u: AiUsage) => {
    inTok += u.inputTokens + u.cacheCreationTokens + u.cacheReadTokens;
    outTok += u.outputTokens;
  };

  type Job = { name: string; pages: number[]; kind: SheetKind; sheetId: string | null; title: string | null; text: TextItem[]; evidence: (ids: number[]) => Evidence[] };
  const jobs: Job[] = drawings.map((f) => ({
    name: f.title.sheetId ?? `page ${f.page}`,
    pages: [f.page],
    kind: f.kind,
    sheetId: f.title.sheetId,
    title: f.title.title,
    text: f.text,
    evidence: (ids) => [{ page: f.page, text: ids, method: "ai" }],
  }));
  if (documents.length) {
    // One read for all the consent papers: text ids renumbered page by page.
    const OFFSET = 100_000;
    const text: TextItem[] = documents.flatMap((f, i) => f.text.map((t) => ({ ...t, id: i * OFFSET + t.id })));
    jobs.push({
      name: "the consent papers",
      pages: documents.map((f) => f.page),
      kind: "consent_document",
      sheetId: null,
      title: "Building consent documents",
      text,
      evidence: (ids) => {
        const byPage = new Map<number, number[]>();
        for (const id of ids) {
          const f = documents[Math.floor(id / OFFSET)];
          if (f) byPage.set(f.page, [...(byPage.get(f.page) ?? []), id % OFFSET]);
        }
        return [...byPage.entries()].map(([page, t]) => ({ page, text: t, method: "ai" as const }));
      },
    });
  }

  // Scanned pages: two independent reads, keep what both agree on.
  const sheetTitles: Record<number, ScanSheet> = {};
  const scanOpenings: Array<ScanOpening & { page: number }> = [];
  const scannedPages = new Set<number>();
  type ScanJob = { page: number; name: string };
  const scanJobs: ScanJob[] = scans.map((f) => ({ page: f.page, name: f.title.sheetId ?? `page ${f.page}` }));
  const readScan = async (job: ScanJob) => {
    const pdf = await pagesPdf(src, [job.page]);
    const call = { pdf, prompt: scanPrompt({ page: job.page, name: job.name }) };
    const opts = { system: SCAN_SYSTEM_PROMPT, schema: SCAN_READING_SCHEMA };
    const [a, b] = await Promise.all([readSheetWithAi(call, { ...opts, model: aiModel("planSet") }), readSheetWithAi(call, { ...opts, model: aiModel("planSetCheck") })]);
    addUsage(a.usage);
    addUsage(b.usage);
    const { agreed, kept: k, dropped: d } = agreeScans(parseScan(a.json), parseScan(b.json));
    kept += k;
    dropped += d;
    scannedPages.add(job.page);
    if (agreed.sheet) sheetTitles[job.page] = agreed.sheet;
    for (const o of agreed.openings) scanOpenings.push({ ...o, page: job.page });
    const name = agreed.sheet?.id || job.name;
    readings.push({ name, evidence: () => [{ page: job.page, method: "ai" }], reading: agreed.reading });
  };

  // Two reads at a time.
  let next = 0;
  let nextScan = 0;
  const worker = async () => {
    while (nextScan < scanJobs.length) {
      const job = scanJobs[nextScan++];
      try {
        await readScan(job);
      } catch (e) {
        failures++;
        captureError(e, { route: "plansets/interpret:scan" });
      }
    }
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const pdf = await pagesPdf(src, job.pages);
        const res = await readSheetWithAi({ pdf, prompt: sheetPrompt({ sheetId: job.sheetId, title: job.title, kind: job.kind, text: job.text }) });
        addUsage(res.usage);
        const v = verifyReading(res.reading, job.text);
        kept += v.kept;
        dropped += v.dropped;
        readings.push({ name: job.name, evidence: job.evidence, reading: v.reading });
      } catch (e) {
        failures++;
        captureError(e, { route: "plansets/interpret" });
      }
    }
  };
  await Promise.all([worker(), worker()]);

  let model = mergeReadings(input.model, readings);
  model = markScanned(addScanOpenings(model, scanOpenings), scannedPages);
  model = {
    ...model,
    ai: { sheetsRead: readings.length, itemsKept: kept, itemsDropped: dropped, skipped: null },
    flags: failures
      ? [...model.flags, { id: "ai-failures", level: "info", topic: "other", message: `${failures} sheet${failures === 1 ? "" : "s"} couldn't be read by the AI this time; the rest were.`, evidence: [] }]
      : model.flags,
  };
  const usd = (inTok * USD_IN + outTok * USD_OUT) / 1e6;
  if (scannedPages.size) {
    model.flags.push({
      id: "scanned-pages",
      level: "info",
      topic: "unreadable",
      message: `${scannedPages.size} page${scannedPages.size === 1 ? " was a scan or photo" : "s were scans or photos"}, so ${scannedPages.size === 1 ? "it was" : "they were"} read twice by two different AIs and only what both read the same way was kept. Nothing is measured off a scan — check those values on the plan.`,
      evidence: [...scannedPages].map((page) => ({ page, method: "ai" as const })),
    });
  }
  return { model, usage: { sheets: readings.length, scans: scannedPages.size, failures, inputTokens: inTok, outputTokens: outTok, usd: Math.round(usd * 100) / 100 }, sheetTitles };
}
