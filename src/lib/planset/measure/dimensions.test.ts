import { describe, expect, it } from "vitest";
import type { Segment, TextItem } from "../types";
import { buildChains, checkChains, proveScales, readDimensions } from "./dimensions";

let nextId = 0;
const label = (s: string, x: number, y: number, angle = 0): TextItem => ({ id: nextId++, s, x, y, angle, h: 2.5, w: s.length * 1.4 });
const line = (x1: number, y1: number, x2: number, y2: number, w = 0.15): Segment => ({ x1, y1, x2, y2, c: "#000000", w, dashed: false });

/** A horizontal chain 650 + 6000 + 3390 at 1:100, and its 10,040 overall above it. */
function sampleSheet() {
  nextId = 0;
  const text: TextItem[] = [];
  const segs: Segment[] = [];
  let x = 20;
  for (const v of [650, 6000, 3390]) {
    const len = v / 100;
    segs.push(line(x, 50, x + len, 50));
    const t = label(v.toLocaleString("en-NZ"), x + len / 2 - 3, 49.2);
    text.push(t);
    x += len;
  }
  segs.push(line(20, 44, 20 + 100.4, 44));
  text.push(label("10,040", 20 + 50.2 - 4, 43.2));
  // A vertical 1:100 dimension reading bottom→top, line to its right.
  segs.push(line(10, 120, 10, 60));
  text.push(label("6,000", 9.2, 94, 90));
  // Noise: a title-block number with no line near it, and a thick wall line.
  text.push(label("2025", 300, 280));
  segs.push(line(0, 200, 400, 200, 0.7));
  return { text, segs };
}

describe("readDimensions", () => {
  it("pairs each printed number with the line it labels", () => {
    const sheet = sampleSheet();
    const dims = readDimensions(sheet);
    const byMm = (mm: number) => dims.find((d) => d.mm === mm)!;
    expect(byMm(650).ratio).toBeCloseTo(100, 1);
    expect(byMm(6000).orientation).toBe("h");
    expect(byMm(10040).paperMm).toBeCloseTo(100.4, 2);
    const vertical = dims.find((d) => d.orientation === "v")!;
    expect(vertical.mm).toBe(6000);
    expect(vertical.ratio).toBeCloseTo(100, 1);
    expect(byMm(2025).line).toBeNull();
  });
});

describe("proveScales", () => {
  it("proves 1:100 when enough dimensions agree, and snaps to the standard ratio", () => {
    const sheet = sampleSheet();
    const dims = readDimensions(sheet);
    const byId = (id: number) => sheet.text.find((t) => t.id === id);
    const proofs = proveScales(dims, byId);
    expect(proofs[0]).toMatchObject({ ratio: 100, count: 5 });
  });
  it("proves nothing from too few dimensions", () => {
    const sheet = sampleSheet();
    const dims = readDimensions(sheet).slice(0, 3);
    expect(proveScales(dims, (id) => sheet.text.find((t) => t.id === id))).toEqual([]);
  });
});

describe("chains", () => {
  it("adds a chain up and checks it against the overall", () => {
    const sheet = sampleSheet();
    const dims = readDimensions(sheet);
    const chains = buildChains(dims);
    expect(chains).toHaveLength(1);
    expect(chains[0].sumMm).toBe(10040);
    const checks = checkChains(chains, dims);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ ok: true, differenceMm: 0 });
  });
  it("flags a chain that doesn't add up", () => {
    const sheet = sampleSheet();
    const wrong = sheet.text.find((t) => t.s === "10,040")!;
    wrong.s = "10,240";
    const dims = readDimensions(sheet);
    const checks = checkChains(buildChains(dims), dims);
    expect(checks[0]).toMatchObject({ ok: false, differenceMm: -200 });
  });
});
