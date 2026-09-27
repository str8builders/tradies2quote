// The new look's plan reader ("Photo of a plan"), every step rendered to
// static HTML from a stand-in model: useScanPanel's work (files, the scan
// API) needs a browser and is shared with the old look, whose markup
// _components/ScanPanel.render.test.tsx pins.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TapeProgress from "@/app/_components/landing/TapeProgress";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { FloorPlanSvg } from "@/lib/floorPlanSvg";
import type { ScannedPlan } from "@/lib/scan-drawing";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { SCAN_SLOW_NOTICE, type ScanPanelModel, type ScanResult } from "../_components/ScanPanel";
import { PlanReaderView } from "./PlanReader";

const noop = () => {};
const PHOTO = "blob:drawing-photo";

const PLAN: ScannedPlan = {
  shape: "rect",
  width_m: 6,
  length_m: 4,
  regions: null,
  wall_run_m: null,
  exterior_wall_run_m: null,
  interior_wall_run_m: null,
  wall_thickness_mm: null,
  stud_spacing_mm: null,
  door_count: null,
  window_count: null,
  area_m2: 24,
  perimeter_m: 20,
  shape_label: "Rectangle",
  tri_base_m: null,
  tri_height_m: null,
  radius_m: null,
  trap_a_m: null,
  trap_b_m: null,
  trap_h_m: null,
  post_count: 6,
  post_spacing_m: null,
  joist_spacing_mm: 450,
  joist_orientation: "width",
  height_m: 1.2,
  review_flags: ["The 4 m side reads 40 m in one place."],
};

const RESULT: ScanResult = {
  buildType: "Timber deck",
  summary: "A rectangular deck, 1.2 m off the ground.",
  dimensions: "Deck: 6 m x 4 m\nJoists at 450 centres",
  structural: "",
  notes: "",
  plan: PLAN,
  documentType: "drawing",
  detectedType: "Deck",
};

function model(patch: Partial<ScanPanelModel> = {}): ScanPanelModel {
  return {
    state: "idle",
    setState: noop,
    error: "",
    previewUrl: null,
    hint: "",
    setHint: noop,
    jobType: "",
    setJobType: noop,
    timberLengthInput: "6",
    setTimberLengthInput: noop,
    scanResult: null,
    editedDimensions: "",
    setEditedDimensions: noop,
    scanComplete: false,
    scanSlow: false,
    fileInputRef: { current: null },
    cameraInputRef: { current: null },
    onFileChange: noop,
    generateMaterials: noop,
    rescan: noop,
    backToSetup: noop,
    fullReset: noop,
    canScan: true,
    ...patch,
  };
}

const render = (patch: Partial<ScanPanelModel> = {}, transcript = "") =>
  renderToStaticMarkup(<PlanReaderView scan={model(patch)} transcript={transcript} setTranscript={noop} />);

/** The opening tag of the first element containing a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in the markup`).toBeGreaterThanOrEqual(0);
  const start = markup.lastIndexOf("<", at);
  return markup.slice(start, markup.indexOf(">", at) + 1);
}

/** The words a person sees, one space apart. */
const words = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const reviewing: Partial<ScanPanelModel> = {
  state: "review-dims",
  scanResult: RESULT,
  editedDimensions: RESULT.dimensions,
  previewUrl: PHOTO,
};

const STEPS: { name: string; patch: Partial<ScanPanelModel>; transcript?: string }[] = [
  { name: "setup", patch: {} },
  { name: "setup, a job type picked", patch: { jobType: "Deck" } },
  { name: "preparing the photo", patch: { state: "converting", canScan: false } },
  { name: "reading", patch: { state: "uploading", canScan: false, previewUrl: PHOTO } },
  { name: "reading, running long", patch: { state: "uploading", canScan: false, scanSlow: true } },
  { name: "read failed", patch: { state: "error", error: "Scan failed (500). Please try again." } },
  { name: "checking the sizes", patch: { ...reviewing, jobType: "Fence" } },
  { name: "checking the takeoff", patch: { ...reviewing, state: "transcript" }, transcript: "Deck 6 x 4 m" },
  {
    name: "a supplier quote",
    patch: { state: "wrong-doc", scanResult: { ...RESULT, documentType: "supplier_quote" }, previewUrl: PHOTO },
  },
];

describe("PlanReader (new look)", () => {
  it.each(STEPS)("$name: follows the design rules and needs no old-look safety net", ({ patch, transcript }) => {
    const out = render(patch, transcript);
    expect(markupRuleBreaks(out)).toEqual([]);
    expect(out).not.toContain("data-legacy-body");
    expect(out).not.toMatch(/class="[^"]*\bt2q-/);
    // The screen's heading labels the panel, as it did ScanPanel's.
    expect(tag(out, 'data-testid="panel-scan"')).toContain('aria-labelledby="tab-scan"');
    expect(tag(out, 'data-testid="panel-scan"')).toContain('role="tabpanel"');
  });

  it("setup: the job type, timber length and notes, then Take photo and Upload image", () => {
    const out = render();
    expect(out).toContain('data-testid="scan-upload-input"');
    expect(tag(out, 'data-testid="scan-camera-input"')).toContain('capture="environment"');
    expect(tag(out, 'data-testid="scan-jobtype"')).toContain('role="radiogroup"');
    expect(out.match(/role="radio"/g)).toHaveLength(6);
    expect(tag(out, 'data-testid="scan-jobtype-deck"')).toContain('aria-checked="false"');
    expect(out).toContain("Pick one only to nudge it.");
    const timber = tag(out, 'data-testid="scan-timber-length"');
    expect(timber).toMatch(/^<input/);
    expect(timber).toContain('min="2.4"');
    expect(timber).toContain('max="7.2"');
    expect(timber).toContain('value="6"');
    expect(tag(out, 'data-testid="scan-hint"')).toContain('maxLength="500"');
    expect(tag(out, 'data-testid="scan-take-photo"')).not.toContain("disabled");
    expect(tag(out, 'data-testid="scan-upload"')).not.toContain("disabled");
    expect(tag(out, 'data-testid="scan-status"')).toContain('aria-live="polite"');
    expect(words(out)).toContain("JPEG, PNG, WebP, GIF or iPhone HEIC photos.");
  });

  it("a picked job type is checked and the nudge goes", () => {
    const out = render({ jobType: "Deck" });
    expect(tag(out, 'data-testid="scan-jobtype-deck"')).toContain('aria-checked="true"');
    expect(out).not.toContain("Pick one only to nudge it.");
  });

  it("while the photo is prepared or read, the choices wait and the live line says why", () => {
    const converting = render({ state: "converting", canScan: false });
    expect(tag(converting, 'data-testid="scan-take-photo"')).toContain("disabled");
    expect(words(converting)).toContain("Preparing photo…");

    const reading = render({ state: "uploading", canScan: false, previewUrl: PHOTO });
    expect(tag(reading, 'data-testid="scan-upload"')).toContain("disabled");
    expect(tag(reading, 'data-testid="scan-hint"')).toContain("disabled");
    expect(tag(reading, 'data-testid="scan-jobtype-deck"')).toContain("disabled");
    expect(tag(reading, 'role="progressbar"')).toContain('aria-label="Reading your drawing"');
    expect(reading).toContain('alt="Drawing preview"');
    expect(words(reading)).toContain("Reading your drawing…");
    expect(render({ state: "uploading", canScan: false, scanSlow: true })).toContain(SCAN_SLOW_NOTICE);
  });

  it("a failed read says why in the live line, with Try again", () => {
    const out = render({ state: "error", error: "Scan failed (500). Please try again." });
    const status = out.slice(out.indexOf('data-testid="scan-status"'));
    expect(status).toMatch(/data-testid="scan-error"[^>]*>Scan failed \(500\)\. Please try again\.</);
    expect(words(status)).toContain("Try again");
  });

  it("checking the sizes: what was read, what to check, the schematic, then the sizes to fix", () => {
    const out = render({ ...reviewing, jobType: "Fence" });
    expect(out).toContain('data-testid="scan-type-mismatch-notice"');
    expect(words(out)).toContain("You picked Fence, but this drawing looks like Timber deck.");
    expect(out).toContain('data-testid="scan-geometry"');
    expect(words(out)).toContain("Rectangle Area 24 m² Perimeter 20 m");
    expect(tag(out, 'data-testid="scan-review-flags"')).toMatch(/^<ul/);
    expect(words(out)).toContain("The 4 m side reads 40 m in one place.");
    expect(out).toContain('data-testid="floor-plan-wrapper"');
    expect(words(out)).toContain("joists along width");
    expect(out).toContain('alt="Scanned drawing"');
    expect(tag(out, 'data-testid="scan-dimensions"')).toMatch(/^<textarea/);
    expect(out).toContain("Joists at 450 centres</textarea>");
    expect(tag(out, 'data-testid="scan-generate-materials"')).not.toContain("disabled");
    expect(out).toContain('data-testid="scan-back-to-setup"');

    // Picked what the drawing shows: nothing to flag. Sizes cleared: nothing to count.
    expect(render({ ...reviewing, jobType: "Deck" })).not.toContain("scan-type-mismatch-notice");
    const empty = render({ ...reviewing, editedDimensions: "  " });
    expect(tag(empty, 'data-testid="scan-generate-materials"')).toContain("disabled");
  });

  it("checking the takeoff: the words to fix, remove the drawing, or back to the sizes", () => {
    const out = render({ ...reviewing, state: "transcript" }, "Deck 6 x 4 m, 450 joist centres");
    expect(tag(out, 'data-testid="scan-transcript"')).toMatch(/^<textarea/);
    expect(out).toContain("Deck 6 x 4 m, 450 joist centres</textarea>");
    expect(tag(out, 'data-testid="scan-clear"')).toContain('aria-label="Remove drawing"');
    expect(out).toContain('data-testid="scan-back-to-dims"');
    expect(out).not.toContain('data-testid="scan-dimensions"');
  });

  it("a supplier quote goes to the quote importer first, with the drawing takeoff still there", () => {
    const out = render({
      state: "wrong-doc",
      scanResult: { ...RESULT, documentType: "supplier_quote" },
      previewUrl: PHOTO,
    });
    expect(out).toContain('data-testid="scan-wrong-doc"');
    const importer = tag(out, 'data-testid="scan-wrong-doc-import"');
    expect(importer).toMatch(/^<a /);
    expect(importer).toContain('href="/app/materials/import-quote"');
    expect(out).toContain('data-testid="scan-wrong-doc-continue"');
    expect(out).not.toContain('data-testid="scan-dimensions"');
  });

  it("PlanReader.tsx follows the design rules in its source", () => {
    const source = readFileSync(join(process.cwd(), "src/app/app/quotes/new/_v2/PlanReader.tsx"), "utf8");
    expect(sourceRuleBreaks(source)).toEqual([]);
  });
});

describe("the schematic (FloorPlanSvg, shared with the old look)", () => {
  it("keeps the classic labels by default; the new look only spells out the joist arrow", () => {
    const classic = renderToStaticMarkup(<FloorPlanSvg plan={PLAN} jobType="Deck" />);
    expect(classic).toContain("joists ↔ width");
    expect(renderToStaticMarkup(<FloorPlanSvg plan={PLAN} jobType="Deck" look="new" />)).toBe(
      classic.replace("joists ↔ width", "joists along width"),
    );
  });
});

describe("the reading tape (TapeMeasureProgress, shared)", () => {
  it("keeps the classic gauge by default", () => {
    expect(renderToStaticMarkup(<TapeMeasureProgress />)).toBe(
      renderToStaticMarkup(<TapeProgress progress={0.02} width={360} label="// scanning" />),
    );
  });

  it("look new: a ui- blade that names itself, and gives a number only when the read is done", () => {
    const reading = renderToStaticMarkup(<TapeMeasureProgress look="new" label="Reading your drawing" />);
    expect(markupRuleBreaks(reading)).toEqual([]);
    expect(tag(reading, 'role="progressbar"')).toContain('aria-label="Reading your drawing"');
    expect(tag(reading, 'role="progressbar"')).not.toContain("aria-valuenow");
    const done = renderToStaticMarkup(<TapeMeasureProgress look="new" done label="Reading your drawing" />);
    expect(tag(done, 'role="progressbar"')).toContain('aria-valuenow="100"');
  });
});
