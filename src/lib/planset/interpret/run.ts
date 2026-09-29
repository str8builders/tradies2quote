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
import { sheetPrompt } from "./prompt";
import { verifyReading } from "./verify";
import { mergeReadings, type SheetReadingAt } from "./merge";

/** Which sheets are worth an AI read, most useful first. */
const PRIORITY: SheetKind[] = ["notes", "specification", "sections", "structural_notes", "roof_plan", "floor_plan", "site_plan", "wet_areas", "elevations", "cover"];
/** Most drawing sheets read per set (cost cap). */
export const MAX_AI_SHEETS = 14;
/** Consent papers bundled into one read. */
const MAX_DOC_PAGES = 12;

// Claude Opus 5.5 list prices, US$ per million tokens.
const USD_IN = 4, USD_OUT = 20;

export type InterpretInput = { facts: readonly SheetFacts[]; pdf: Uint8Array; model: BuildingModel; register: Register };
export type InterpretResult = { model: BuildingModel; usage: Record<string, unknown> };

export function pickSheets(facts: readonly SheetFacts[]): { drawings: SheetFacts[]; documents: SheetFacts[] } {
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
  return { drawings: capped.slice(0, MAX_AI_SHEETS), documents: facts.filter((f) => f.document).slice(0, MAX_DOC_PAGES) };
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
      flags: [...input.model.flags, { id: "ai-skipped", level: "info", topic: "other", message: `Notes, sections and consent papers weren't read: ${reason}`, evidence: [] }],
    },
    usage: { skipped: reason },
  });
  if (process.env.PLAN_SET_AI === "off") return skip("the AI reading is switched off.");
  if (!process.env.ANTHROPIC_API_KEY) return skip("no AI key on this server.");

  const { drawings, documents } = pickSheets(input.facts);
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

  // Two reads at a time.
  let next = 0;
  const worker = async () => {
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
  model = {
    ...model,
    ai: { sheetsRead: readings.length, itemsKept: kept, itemsDropped: dropped, skipped: null },
    flags: failures
      ? [...model.flags, { id: "ai-failures", level: "info", topic: "other", message: `${failures} sheet${failures === 1 ? "" : "s"} couldn't be read by the AI this time; the rest were.`, evidence: [] }]
      : model.flags,
  };
  const usd = (inTok * USD_IN + outTok * USD_OUT) / 1e6;
  return { model, usage: { sheets: readings.length, failures, inputTokens: inTok, outputTokens: outTok, usd: Math.round(usd * 100) / 100 } };
}
