// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — merge the (verified) AI readings into the model (pure).
//
// Two sheets saying the same thing → "checked". Two sheets disagreeing on a
// single-valued thing (stud height, a wall's R-value, the roof pitch) → the
// tradie is asked, and the designer gets an RFI; nothing is averaged.
// ─────────────────────────────────────────────────────────────────────────

import type { Evidence } from "../types";
import type { BuildingModel, Fact, Flag } from "../model/types";
import type { SheetReading } from "./schema";
import { numbersIn } from "./verify";

export type SheetReadingAt = {
  /** Evidence for an item: the page(s) and text ids it cites. */
  evidence: (textIds: number[]) => Evidence[];
  /** Name for messages ("A00.1", "the consent papers"). */
  name: string;
  reading: SheetReading;
};

/** Topics where two different values mean something is wrong. */
const SINGLE_VALUED = new Set(["stud_spacing", "insulation_walls", "insulation_ceiling", "insulation_floor", "slab_thickness"]);

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

function addFact(list: Fact<string>[], value: string, evidence: Evidence[]): void {
  const existing = list.find((f) => key(f.value) === key(value));
  if (existing) {
    existing.evidence.push(...evidence);
    if (new Set(existing.evidence.map((e) => e.page)).size > 1) existing.status = "checked";
  } else {
    list.push({ value, status: "read", evidence: [...evidence] });
  }
}

/** One number from several sheets: agree → checked, disagree → needs_check + flag. */
function numberFact(
  found: Array<{ value: number; evidence: Evidence[]; where: string }>,
  label: string,
  unit: string,
  flags: Flag[],
  flagId: string,
  /** "conflict": one value should hold everywhere (stud height). "varies": several can be right (a raked ceiling, a portico roof). */
  kind: "conflict" | "varies" = "conflict",
): Fact<number> | null {
  if (!found.length) return null;
  const counts = new Map<number, typeof found>();
  for (const f of found) counts.set(f.value, [...(counts.get(f.value) ?? []), f]);
  const ranked = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
  const [value, backers] = ranked[0];
  const evidence = backers.flatMap((b) => b.evidence);
  if (ranked.length > 1) {
    const all = ranked.map(([v, fs]) => `${v}${unit} (${[...new Set(fs.map((f) => f.where))].join(", ")})`).join(kind === "conflict" ? " vs " : " and ");
    if (kind === "conflict") {
      flags.push({
        id: flagId,
        level: "check",
        topic: "spec",
        message: `The plans give different ${label}s: ${all}.`,
        evidence: found.flatMap((f) => f.evidence),
        question: { kind: "number", prompt: `Which ${label} should I use?`, unit: unit.trim() || "mm" },
        rfi: `Please confirm the ${label}: the drawings show ${all}.`,
      });
      return { value, status: "needs_check", evidence };
    }
    flags.push({
      id: flagId,
      level: "info",
      topic: "spec",
      message: `The plans show more than one ${label}: ${all}. I used ${value}${unit}, the one most sheets give — change it if it's wrong for this job.`,
      evidence: found.flatMap((f) => f.evidence),
    });
    return { value, status: "read", evidence };
  }
  const sheets = new Set(evidence.map((e) => e.page));
  return { value, status: sheets.size > 1 ? "checked" : "read", evidence };
}

export function mergeReadings(model: BuildingModel, readings: readonly SheetReadingAt[]): BuildingModel {
  const out: BuildingModel = {
    ...model,
    specs: { ...model.specs },
    consent: { inspections: [...model.consent.inspections], documents: [...model.consent.documents], conditions: [...model.consent.conditions] },
    rooms: [...model.rooms],
    legend: [...model.legend],
    byOthers: [...model.byOthers],
    flags: [...model.flags],
  };
  const studs: Array<{ value: number; evidence: Evidence[]; where: string }> = [];
  const ceilings: Array<{ value: number; evidence: Evidence[]; where: string }> = [];
  const pitches: Array<{ value: number; evidence: Evidence[]; where: string }> = [];
  const roofMaterial: Fact<string>[] = [];
  const zones: Record<string, Fact<string>[]> = {};

  for (const r of readings) {
    const { reading } = r;
    for (const s of reading.specs) addFact((out.specs[s.topic] ??= []), s.value, r.evidence(s.text_ids));
    for (const h of reading.heights) {
      const entry = { value: Math.round(h.mm), evidence: r.evidence(h.text_ids), where: h.where || r.name };
      if (h.kind === "stud_height") studs.push(entry);
      if (h.kind === "ceiling_height") ceilings.push(entry);
    }
    for (const x of reading.roof) {
      if (x.kind === "pitch_deg") {
        const n = numbersIn(x.value)[0];
        if (n !== undefined && n > 0 && n < 75) pitches.push({ value: n, evidence: r.evidence(x.text_ids), where: r.name });
      } else if (x.kind === "material" || x.kind === "profile") addFact(roofMaterial, x.value, r.evidence(x.text_ids));
      else addFact((out.specs[`roof_${x.kind}`] ??= []), x.value, r.evidence(x.text_ids));
    }
    for (const z of reading.zones) addFact((zones[z.kind] ??= []), z.value, r.evidence(z.text_ids));
    for (const c of reading.consent) {
      const list = c.kind === "inspection" ? out.consent.inspections : c.kind === "document" ? out.consent.documents : out.consent.conditions;
      addFact(list, c.text, r.evidence(c.text_ids));
    }
    for (const room of reading.rooms) {
      if (!out.rooms.some((x) => key(x.name) === key(room.name))) out.rooms.push({ name: room.name, finishes: room.finishes, wet: room.wet, evidence: r.evidence(room.text_ids) });
    }
    for (const l of reading.legend) {
      if (!out.legend.some((x) => key(x.label) === key(l.label))) out.legend.push({ meaning: l.meaning, label: l.label, evidence: r.evidence(l.text_ids) });
    }
    for (const b of reading.by_others) addFact(out.byOthers, b.item, r.evidence(b.text_ids));
    for (const c of reading.conflicts) {
      out.flags.push({ id: `sheet-conflict-${out.flags.length}`, level: "check", topic: "spec", message: `${r.name}: ${c.issue}`, evidence: r.evidence(c.text_ids), rfi: `${r.name}: ${c.issue}` });
    }
  }

  out.heights = {
    studMm: numberFact(studs, "stud height", " mm", out.flags, "stud-height") ?? out.heights.studMm,
    ceilingMm: numberFact(ceilings, "ceiling height", " mm", out.flags, "ceiling-height", "varies") ?? out.heights.ceilingMm,
  };
  out.roof = {
    ...out.roof,
    pitchDeg: numberFact(pitches, "roof pitch", "°", out.flags, "roof-pitch", "varies") ?? out.roof.pitchDeg,
    material: roofMaterial[0] ?? out.roof.material,
  };
  const zone = (k: string): Fact<string> | null => zones[k]?.[0] ?? null;
  out.zones = { wind: zone("wind") ?? out.zones.wind, earthquake: zone("earthquake") ?? out.zones.earthquake, exposure: zone("exposure") ?? out.zones.exposure, snow: zone("snow") ?? out.zones.snow };
  for (const [k, list] of Object.entries(zones)) {
    if (list.length > 1 && (k === "wind" || k === "earthquake" || k === "exposure")) {
      out.flags.push({
        id: `zone-${k}`,
        level: "check",
        topic: "spec",
        message: `The plans give different ${k} zones: ${list.map((f) => f.value).join(" vs ")}.`,
        evidence: list.flatMap((f) => f.evidence),
        rfi: `Please confirm the ${k} zone: the drawings show ${list.map((f) => f.value).join(" and ")}.`,
      });
    }
  }
  for (const topic of SINGLE_VALUED) {
    const list = out.specs[topic];
    if (list && list.length > 1) {
      out.flags.push({
        id: `spec-${topic}`,
        level: "check",
        topic: "spec",
        message: `The plans give different ${topic.replace(/_/g, " ")}: ${list.map((f) => `"${f.value}"`).join(" vs ")}.`,
        evidence: list.flatMap((f) => f.evidence),
        rfi: `Please confirm ${topic.replace(/_/g, " ")}: the drawings show ${list.map((f) => `"${f.value}"`).join(" and ")}.`,
      });
      for (const f of list) f.status = "needs_check";
    }
  }
  return out;
}
