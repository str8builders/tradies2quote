"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Receipt,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { FloorPlanSvg } from "@/lib/floorPlanSvg";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { needsPrep, prepareScanImage } from "@/lib/scanImage";
import {
  MAX_SCAN_UPLOAD_BYTES,
  SCAN_IMAGE_ACCEPT,
  detectImageMime,
  isPreparedScanMime,
  isSupportedScanInput,
  scanUploadSizeError,
} from "@/lib/imageUpload";
import type { ScannedPlan } from "@/app/api/quotes/scan-drawing/route";

type ScanState =
  | "idle"
  | "converting"
  | "uploading"
  | "review-dims"
  | "transcript"
  | "wrong-doc"
  | "error";

const JOB_TYPES = ["Deck", "Fence", "Framing", "Concrete", "Roofing", "Other"] as const;
type JobType = (typeof JOB_TYPES)[number];

const TIMBER_LENGTH_DEFAULT = 6;
const TIMBER_LENGTH_MIN = 2.4;
const TIMBER_LENGTH_MAX = 7.2;

interface ScanResult {
  buildType: string;
  summary: string;
  dimensions: string;
  structural: string;
  notes: string;
  plan: ScannedPlan | null;
  documentType: "drawing" | "supplier_quote" | "other";
  // Structure type the AI read off the DRAWING — the source of truth for
  // the calculator marker and the "Job type:" line. The user's selection
  // is only a hint passed to the scan; this is what actually shows.
  detectedType: JobType;
}

/**
 * Map the scan UI's six job-type buttons to the takeoff calculator's
 * canonical types. Anything that doesn't have a calculator (Fence,
 * Concrete, Roofing, Other) gets undefined and we skip the marker —
 * the AI fallback handles those.
 */
function planTypeForJob(
  jobType: JobType,
  buildType: string,
): "deck" | "subfloor" | "cladding" | "wall" | undefined {
  if (jobType === "Deck") return "deck";
  if (jobType === "Framing") {
    const bt = buildType.toLowerCase();
    if (bt.includes("subfloor") || bt.includes("floor framing")) return "subfloor";
    if (bt.includes("cladding") || bt.includes("weatherboard")) return "cladding";
    return "wall";
  }
  return undefined;
}

function buildPlanMarker(
  planType: "deck" | "subfloor" | "cladding" | "wall",
  plan: ScannedPlan,
): string {
  const parts = [`type=${planType}`];
  // Enforce NZ convention: length ≥ width. The deck calculator runs
  // joists across the width and decking along the length, so swapping
  // them silently produces a slightly different joist count. The
  // extractRectangle helper already enforces this for prose-scanned
  // dims; do the same for the marker.
  if (plan.length_m > 0 && plan.width_m > 0) {
    const lengthM = Math.max(plan.length_m, plan.width_m);
    const widthM = Math.min(plan.length_m, plan.width_m);
    parts.push(`length_m=${lengthM}`);
    parts.push(`width_m=${widthM}`);
  } else {
    if (plan.length_m > 0) parts.push(`length_m=${plan.length_m}`);
    if (plan.width_m > 0) parts.push(`width_m=${plan.width_m}`);
  }
  // Composite/primitive footprints carry a deterministically-computed area
  // (L-shape, triangle, …). Pass it through so area-based calculators use the
  // true figure instead of length×width of the bounding box.
  if (plan.area_m2 && plan.area_m2 > 0 && plan.shape_label) {
    parts.push(`area_m2=${plan.area_m2}`);
  }
  if (plan.height_m && plan.height_m > 0) {
    parts.push(`height_m=${plan.height_m}`);
  }
  if (plan.joist_spacing_mm && plan.joist_spacing_mm > 0) {
    parts.push(`joist_spacing_mm=${plan.joist_spacing_mm}`);
  }
  if (plan.post_count && plan.post_count > 0) {
    parts.push(`post_count=${plan.post_count}`);
  }
  if (plan.post_spacing_m && plan.post_spacing_m > 0) {
    parts.push(`post_spacing_m=${plan.post_spacing_m}`);
  }
  // Wave 44 — whole-drawing wall totals. For a wall/framing job the
  // calculator must run off the TOTAL wall run (every exterior + interior
  // wall summed), not the bounding-box edge in length_m. These fields are
  // only present on multi-room floor plans; older plans omit them and the
  // downstream parser keeps using length_m as before.
  if (plan.wall_run_m && plan.wall_run_m > 0) {
    parts.push(`wall_run_m=${plan.wall_run_m}`);
  }
  // Exterior (perimeter) wall run, when the AI could split it off the drawing.
  // Lets the wall calculator size insulation off exterior walls only. Absent →
  // insulation stays review-required (no exterior/interior guess).
  if (plan.exterior_wall_run_m && plan.exterior_wall_run_m > 0) {
    parts.push(`exterior_wall_run_m=${plan.exterior_wall_run_m}`);
  }
  if (plan.stud_spacing_mm && plan.stud_spacing_mm > 0) {
    parts.push(`stud_spacing_mm=${plan.stud_spacing_mm}`);
  }
  if (plan.door_count && plan.door_count > 0) {
    parts.push(`door_count=${plan.door_count}`);
  }
  if (plan.window_count && plan.window_count > 0) {
    parts.push(`window_count=${plan.window_count}`);
  }
  return "[T2Q_PLAN] " + parts.join(" ");
}

function buildFinalTranscript(
  jobType: JobType,
  timberLength: number,
  result: ScanResult,
  editedDimensions: string,
): string {
  const parts: string[] = [];

  // Wave 43 — structured markers at the very top. The parser reads
  // these BEFORE the loose text so the calculator gets the AI's
  // structured guess directly, not whatever first "X by Y" pattern
  // happens to appear in the prose. Skipping these on job types
  // without a calculator (Fence/Concrete/Roofing/Other) is fine —
  // the AI quote path handles those without a calculator anyway.
  const planType = planTypeForJob(jobType, result.buildType);
  if (planType) {
    // Always emit the classified type marker so detectTakeoffType routes off the
    // AI's drawing classification — even when geometry failed to parse. Without
    // this, a house/wall scan with no readable dimensions fell through to loose
    // keyword matching, where the boilerplate word "decking" misrouted it to the
    // deck calculator. A type-only marker keeps it on the wall/framing path; the
    // downstream calculator then asks for the missing dimensions rather than
    // fabricating them.
    parts.push(
      result.plan ? buildPlanMarker(planType, result.plan) : `[T2Q_PLAN] type=${planType}`,
    );
  }
  parts.push(`[T2Q_TIMBER] stock_length_m=${timberLength}`);

  parts.push(`Job type: ${jobType}.`);
  parts.push(
    // NB: do NOT mention "decking" here — this instruction is appended to every
    // scan transcript (wall, subfloor, cladding…), and a stray "decking" token
    // can misroute non-deck jobs to the deck calculator when no marker is read.
    `Tradie buys timber in ${timberLength}m lengths. Calculate board / stud / plate counts in whole ${timberLength}m lengths with a 10% waste factor.`,
  );
  if (result.buildType) {
    parts.push(`What is being built: ${result.buildType}.`);
  }
  if (editedDimensions.trim()) {
    parts.push("DIMENSIONS (tradie-confirmed):\n" + editedDimensions.trim());
  }
  if (result.structural.trim()) {
    parts.push("STRUCTURAL ELEMENTS & FIXINGS:\n" + result.structural.trim());
  }
  if (result.notes.trim()) {
    parts.push("NOTES & ASSUMPTIONS:\n" + result.notes.trim());
  }
  return parts.join("\n\n");
}

export function ScanPanel({
  transcript,
  setTranscript,
}: {
  transcript: string;
  setTranscript: (s: string) => void;
}) {
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hint, setHint] = useState<string>("");
  const [jobType, setJobType] = useState<JobType | "">("");
  const [timberLengthInput, setTimberLengthInput] = useState<string>(
    String(TIMBER_LENGTH_DEFAULT),
  );
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [editedDimensions, setEditedDimensions] = useState<string>("");
  // Drives the tape-measure progress: true = scan finished, snap to 100%.
  const [scanComplete, setScanComplete] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function parsedTimberLength(): number {
    const n = Number.parseFloat(timberLengthInput);
    if (!Number.isFinite(n)) return TIMBER_LENGTH_DEFAULT;
    if (n < TIMBER_LENGTH_MIN) return TIMBER_LENGTH_MIN;
    if (n > TIMBER_LENGTH_MAX) return TIMBER_LENGTH_MAX;
    return Math.round(n * 10) / 10;
  }

  function fullReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setTranscript("");
    setScanResult(null);
    setEditedDimensions("");
    setScanComplete(false);
    setError("");
    setState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function backToSetup() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setTranscript("");
    setScanResult(null);
    setEditedDimensions("");
    setScanComplete(false);
    setError("");
    setState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleFile(inputFile: File) {
    setError("");

    const sourceSizeError = scanUploadSizeError(inputFile);
    if (sourceSizeError) {
      setError(sourceSizeError);
      setState("error");
      return;
    }
    if (!isSupportedScanInput(inputFile)) {
      setError(
        `Unsupported file type: ${inputFile.type || "unknown"}. Use JPEG, PNG, WebP, GIF or HEIC.`,
      );
      setState("error");
      return;
    }

    // Prep the photo client-side before upload: convert iPhone HEIC → JPEG
    // (Claude can't read HEIC) and downscale big photos so they clear
    // Vercel's ~4.5 MB request-body limit (otherwise the upload 413s).
    let file = inputFile;
    if (needsPrep(inputFile)) {
      setState("converting");
      try {
        file = await prepareScanImage(inputFile);
      } catch {
        setError(
          'Couldn’t read that photo. Upload a JPEG, or switch your iPhone Camera to "Most Compatible".',
        );
        setState("error");
        return;
      }
    }

    if (file.size > MAX_SCAN_UPLOAD_BYTES) {
      setError(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 8 MB — try compressing or taking a smaller photo.`,
      );
      setState("error");
      return;
    }
    if (!isPreparedScanMime(detectImageMime(file))) {
      setError(
        `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP or GIF.`,
      );
      setState("error");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setScanComplete(false);
    setState("uploading");

    const timberLength = parsedTimberLength();
    const form = new FormData();
    form.append("image", file, file.name || "drawing.jpg");
    // Job type is an optional hint — only send it if the tradie picked one.
    if (jobType) form.append("jobType", jobType);
    form.append("timberLength", String(timberLength));
    if (hint.trim().length > 0) {
      form.append("hint", hint.trim());
    }

    try {
      const res = await fetch("/api/quotes/scan-drawing", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `Scan failed (${res.status}).`);
        setState("error");
        return;
      }
      const data = (await res.json()) as Partial<ScanResult> & {
        document_type?: string;
        detectedType?: string;
      };
      const documentType: ScanResult["documentType"] =
        data.document_type === "supplier_quote" ||
        data.document_type === "other"
          ? data.document_type
          : "drawing";
      // The AI's image-derived structure type wins. Fall back to whatever
      // the tradie selected (if anything), then "Other" — never assume Deck.
      const detectedType: JobType = (JOB_TYPES as readonly string[]).includes(
        data.detectedType ?? "",
      )
        ? (data.detectedType as JobType)
        : jobType || "Other";
      const result: ScanResult = {
        buildType: (data.buildType ?? "").trim(),
        summary: (data.summary ?? "").trim(),
        dimensions: (data.dimensions ?? "").trim(),
        structural: (data.structural ?? "").trim(),
        notes: (data.notes ?? "").trim(),
        plan: data.plan ?? null,
        documentType,
        detectedType,
      };
      setScanResult(result);
      setEditedDimensions(result.dimensions);
      // Let the tape snap to 100% (the satisfying click) before swapping views.
      setScanComplete(true);
      await new Promise((r) => setTimeout(r, 450));
      // A supplier quote photographed into the drawing scanner produces a
      // hallucinated takeoff — steer the tradie to the quote importer
      // instead, while still letting them force the takeoff if they meant to.
      setState(documentType === "supplier_quote" ? "wrong-doc" : "review-dims");
    } catch {
      setError("Network error. Check your connection and try again.");
      setState("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  function generateMaterials() {
    if (!scanResult) return;
    // Build the transcript off the AI's detected type, NOT the tradie's
    // hint — the drawing decides what gets quoted.
    const final = buildFinalTranscript(
      scanResult.detectedType,
      parsedTimberLength(),
      scanResult,
      editedDimensions,
    );
    setTranscript(final);
    setState("transcript");
  }

  function rescan() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setScanResult(null);
    setEditedDimensions("");
    setScanComplete(false);
    setError("");
    setState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  // Job type is an optional hint now — the camera is always enabled. The AI
  // reads the structure type off the drawing regardless.
  const canScan = state !== "uploading" && state !== "converting";

  return (
    <section
      id="panel-scan"
      role="tabpanel"
      aria-labelledby="tab-scan"
      data-testid="panel-scan"
      className="t2q-card-pro p-6 sm:p-8"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={SCAN_IMAGE_ACCEPT}
        className="hidden"
        data-testid="scan-upload-input"
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={SCAN_IMAGE_ACCEPT}
        capture="environment"
        className="hidden"
        data-testid="scan-camera-input"
        onChange={onFileChange}
      />

      {state === "wrong-doc" && scanResult ? (
        <WrongDocNotice
          previewUrl={previewUrl}
          onContinueAnyway={() => setState("review-dims")}
          onRedo={fullReset}
        />
      ) : state === "transcript" && scanResult ? (
        <ScanTranscriptReview
          transcript={transcript}
          buildType={scanResult.buildType}
          previewUrl={previewUrl}
          onChange={setTranscript}
          onBack={() => setState("review-dims")}
          onRedo={fullReset}
        />
      ) : state === "review-dims" && scanResult ? (
        <>
          {/* Detected-vs-picked notice. The drawing is the source of truth
              (8a6d40b), so when the tradie's optional job-type pick differs
              from what the AI read off the image, tell them we went with the
              drawing — and how to override (re-scan with a different pick). */}
          {jobType && jobType !== scanResult.detectedType ? (
            <div
              data-testid="scan-type-mismatch-notice"
              className="mb-4 flex items-start gap-3 rounded-lg border border-hivis/40 bg-hivis/10 p-3 sm:p-4"
            >
              <Warning
                size={18}
                weight="bold"
                className="mt-0.5 shrink-0 text-hivis"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-ink-200 sm:text-sm">
                You picked{" "}
                <span className="font-semibold text-white">{jobType}</span>, but
                this drawing looks like{" "}
                <span className="font-semibold text-white">
                  {scanResult.buildType || scanResult.detectedType}
                </span>
                . We&apos;ve read it as{" "}
                <span className="font-semibold text-white">
                  {scanResult.detectedType}
                </span>{" "}
                from the drawing. If that&apos;s wrong, go back, change the job
                type and re-scan.
              </p>
            </div>
          ) : null}
          <DimensionReview
            buildType={scanResult.buildType}
            plan={scanResult.plan}
            jobType={scanResult.detectedType}
            previewUrl={previewUrl}
            dimensions={editedDimensions}
            onDimensionsChange={setEditedDimensions}
            onGenerate={generateMaterials}
            onBack={backToSetup}
          />
        </>
      ) : (
        <ScanSetup
          state={state}
          error={error}
          scanComplete={scanComplete}
          previewUrl={previewUrl}
          jobType={jobType}
          setJobType={setJobType}
          timberLengthInput={timberLengthInput}
          setTimberLengthInput={setTimberLengthInput}
          hint={hint}
          setHint={setHint}
          canScan={canScan}
          onTakePhoto={() => cameraInputRef.current?.click()}
          onUpload={() => fileInputRef.current?.click()}
          onRetry={rescan}
        />
      )}
    </section>
  );
}

function ScanSetup({
  state,
  error,
  scanComplete,
  previewUrl,
  jobType,
  setJobType,
  timberLengthInput,
  setTimberLengthInput,
  hint,
  setHint,
  canScan,
  onTakePhoto,
  onUpload,
  onRetry,
}: {
  state: ScanState;
  error: string;
  scanComplete: boolean;
  previewUrl: string | null;
  jobType: JobType | "";
  setJobType: (j: JobType) => void;
  timberLengthInput: string;
  setTimberLengthInput: (s: string) => void;
  hint: string;
  setHint: (s: string) => void;
  canScan: boolean;
  onTakePhoto: () => void;
  onUpload: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {previewUrl && state === "uploading" ? (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Drawing preview"
            className="mx-auto max-h-48 w-auto rounded-sm border border-ink-600 opacity-70"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="mb-4 grid h-24 w-24 place-items-center rounded-full border-2 border-brand text-brand sm:h-28 sm:w-28"
        >
          <Camera weight="bold" className="h-10 w-10 sm:h-12 sm:w-12" />
        </div>
      )}

      {state === "uploading" && (
        <div className="mb-5 flex w-full justify-center">
          <TapeMeasureProgress done={scanComplete} label="// reading drawing" />
        </div>
      )}

      <h3 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
        Scan a hand-drawn plan
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ink-300">
        Snap your sketch — we&rsquo;ll read the drawing, work out what it
        shows and tally the materials. Pick a job type below only if you want
        to nudge what we look for.
      </p>

      <div className="mt-6 w-full max-w-md text-left">
        <label
          id="scan-jobtype-label"
          className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          Job type <span className="text-ink-500">(optional)</span>
        </label>
        <div
          role="radiogroup"
          aria-labelledby="scan-jobtype-label"
          data-testid="scan-jobtype"
          className="mt-2 grid grid-cols-3 gap-2"
        >
          {JOB_TYPES.map((j) => {
            const active = jobType === j;
            return (
              <button
                key={j}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`scan-jobtype-${j.toLowerCase()}`}
                onClick={() => setJobType(j)}
                disabled={state === "uploading"}
                className={[
                  "min-h-11 rounded-sm border px-2 font-display text-sm uppercase tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-brand bg-brand text-ink-900"
                    : "border-ink-600 bg-ink-900 text-ink-300 hover:border-brand hover:text-white",
                ].join(" ")}
              >
                {j}
              </button>
            );
          })}
        </div>
        {!jobType && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
            {"// optional — we read the structure from the drawing"}
          </p>
        )}
      </div>

      <div className="mt-5 w-full max-w-md text-left">
        <label
          htmlFor="scan-timber-length"
          className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          Timber length preference
        </label>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm text-ink-300">I buy timber in</span>
          <input
            id="scan-timber-length"
            data-testid="scan-timber-length"
            type="number"
            inputMode="decimal"
            min={TIMBER_LENGTH_MIN}
            max={TIMBER_LENGTH_MAX}
            step="0.1"
            value={timberLengthInput}
            onChange={(e) => setTimberLengthInput(e.target.value)}
            disabled={state === "uploading"}
            className="w-20 rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-center text-base text-white outline-none focus:border-brand disabled:opacity-50"
          />
          <span className="text-sm text-ink-300">metre lengths</span>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
          {"// default 6m · we factor 10% waste into the count"}
        </p>
      </div>

      <div className="mt-6 flex w-full flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onTakePhoto}
          disabled={!canScan}
          data-testid="scan-take-photo"
          className="t2q-btn-primary-pro inline-flex min-h-[44px] items-center justify-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Camera weight="bold" className="h-5 w-5" />
          Take photo
        </button>
        <button
          type="button"
          onClick={onUpload}
          disabled={!canScan}
          data-testid="scan-upload"
          className="t2q-btn-ghost-pro inline-flex min-h-[44px] items-center justify-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UploadSimple weight="bold" className="h-5 w-5" />
          Upload image
        </button>
      </div>

      <div className="mt-5 w-full max-w-md text-left">
        <label
          htmlFor="scan-hint"
          className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          Optional context
        </label>
        <input
          id="scan-hint"
          data-testid="scan-hint"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          maxLength={500}
          disabled={state === "uploading"}
          placeholder="e.g. Treated pine deck, 1.2m off ground."
          className="mt-2 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand disabled:opacity-50"
        />
      </div>

      <p
        data-testid="scan-status"
        aria-live="polite"
        className="mt-4 min-h-5 text-sm text-ink-300"
      >
        {state === "idle" &&
          "JPEG, PNG, WebP, GIF or iPhone HEIC photos. Large phone photos are compressed before upload."}
        {state === "converting" && "Preparing photo…"}
        {state === "uploading" && "Reading your drawing…"}
        {state === "error" && (
          <span data-testid="scan-error" className="text-red-400">
            {error}
          </span>
        )}
      </p>

      {state === "error" && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm font-mono uppercase tracking-[0.2em] text-brand hover:text-brand-300"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function DimensionReview({
  buildType,
  plan,
  jobType,
  previewUrl,
  dimensions,
  onDimensionsChange,
  onGenerate,
  onBack,
}: {
  buildType: string;
  plan: ScannedPlan | null;
  jobType: JobType | "Other";
  previewUrl: string | null;
  dimensions: string;
  onDimensionsChange: (s: string) => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        data-testid="scan-back-to-setup"
        className="inline-flex items-center gap-1 text-sm font-mono uppercase tracking-[0.2em] text-ink-300 hover:text-white"
      >
        <ArrowLeft weight="bold" className="h-4 w-4" />
        Back
      </button>

      <div className="mt-3">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Here&rsquo;s what I read from your drawing
        </div>
        {buildType && (
          <p className="mt-1 font-display text-base uppercase tracking-tight text-white">
            {buildType}
          </p>
        )}
      </div>

      {plan && (plan.area_m2 != null || plan.perimeter_m != null) && (
        <div
          data-testid="scan-geometry"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {plan.shape_label && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-brand/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-brand">
              {plan.shape_label}
            </span>
          )}
          {plan.area_m2 != null && (
            <span className="rounded-sm border border-ink-700 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-200">
              Area {plan.area_m2} m²
            </span>
          )}
          {plan.perimeter_m != null && (
            <span className="rounded-sm border border-ink-700 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-200">
              Perimeter {plan.perimeter_m} m
            </span>
          )}
        </div>
      )}

      {plan && (
        <div
          data-testid="floor-plan-wrapper"
          className="mt-4 overflow-hidden rounded-sm border border-ink-700 bg-ink-950"
        >
          <div className="border-b border-ink-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            {"// schematic — measure against your drawing"}
          </div>
          <FloorPlanSvg plan={plan} jobType={jobType as JobType} />
        </div>
      )}

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Scanned drawing"
            className="max-h-56 w-auto rounded-sm border border-ink-600"
          />
        </div>
      )}

      <label
        htmlFor="scan-dimensions"
        className="mt-5 block font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
      >
        Dimensions — correct any misreads
      </label>
      <textarea
        id="scan-dimensions"
        data-testid="scan-dimensions"
        value={dimensions}
        onChange={(e) => onDimensionsChange(e.target.value)}
        rows={10}
        className="mt-2 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-white outline-none focus:border-brand"
      />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {"// edit any number we got wrong — the materials list will use these"}
      </p>

      <div className="mt-5">
        <button
          type="button"
          onClick={onGenerate}
          data-testid="scan-generate-materials"
          disabled={dimensions.trim().length === 0}
          className="t2q-btn-primary-pro inline-flex min-h-[44px] w-full items-center justify-center px-5 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          Generate materials →
        </button>
      </div>
    </div>
  );
}

function ScanTranscriptReview({
  transcript,
  buildType,
  previewUrl,
  onChange,
  onBack,
  onRedo,
}: {
  transcript: string;
  buildType: string;
  previewUrl: string | null;
  onChange: (s: string) => void;
  onBack: () => void;
  onRedo: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          data-testid="scan-back-to-dims"
          className="inline-flex items-center gap-1 text-sm font-mono uppercase tracking-[0.2em] text-ink-300 hover:text-white"
        >
          <ArrowLeft weight="bold" className="h-4 w-4" />
          Edit dimensions
        </button>
        <button
          type="button"
          onClick={onRedo}
          data-testid="scan-clear"
          aria-label="Remove drawing"
          className="grid h-11 w-11 place-items-center rounded-sm border border-ink-600 text-ink-300 hover:border-brand hover:text-brand"
        >
          <X weight="bold" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Drawing read
        </div>
        {buildType && (
          <p className="mt-1 font-display text-base uppercase tracking-tight text-white">
            {buildType}
          </p>
        )}
      </div>

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Scanned drawing"
            className="max-h-56 w-auto rounded-sm border border-ink-600"
          />
        </div>
      )}

      <label
        htmlFor="scan-transcript"
        className="mt-4 block font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
      >
        Takeoff — review before we quote
      </label>
      <textarea
        id="scan-transcript"
        data-testid="scan-transcript"
        value={transcript}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        className="mt-2 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-white outline-none focus:border-brand"
      />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {"// edit anything that's wrong — the quote will be built off this text"}
      </p>
    </div>
  );
}

/**
 * Shown when the scan looks like a printed supplier quote rather than a
 * hand-drawn plan. The drawing takeoff would hallucinate over a priced
 * materials list, so we steer the tradie to the quote importer (which
 * mirrors the supplier's lines + prices 1:1) while still letting them force
 * the takeoff if they really did mean to scan a drawing.
 */
function WrongDocNotice({
  previewUrl,
  onContinueAnyway,
  onRedo,
}: {
  previewUrl: string | null;
  onContinueAnyway: () => void;
  onRedo: () => void;
}) {
  return (
    <div data-testid="scan-wrong-doc">
      <div className="flex items-start gap-3 rounded-sm border border-hivis/40 bg-hivis/10 p-4">
        <Warning weight="fill" className="mt-0.5 h-5 w-5 shrink-0 text-hivis" />
        <div>
          <h3 className="font-display text-base uppercase tracking-tight text-white">
            That looks like a supplier quote
          </h3>
          <p className="mt-1 text-sm text-ink-200">
            This scanner reads hand-drawn plans. To turn a merchant quote (ITM,
            PlaceMakers…) into a quote that matches it exactly, use the quote
            importer — it copies the supplier&rsquo;s line items and prices 1:1.
          </p>
        </div>
      </div>

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Scanned document"
            className="max-h-48 w-auto rounded-sm border border-ink-600"
          />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href="/app/materials/import-quote"
          data-testid="scan-wrong-doc-import"
          className="t2q-btn-primary-pro inline-flex min-h-[44px] items-center justify-center gap-2 px-5"
        >
          <Receipt weight="bold" className="h-5 w-5" />
          Open quote importer
        </Link>
        <p className="text-xs text-ink-400 sm:max-w-[14rem]">
          You&rsquo;ll need to take or import the photo again there.
        </p>
        <button
          type="button"
          onClick={onContinueAnyway}
          data-testid="scan-wrong-doc-continue"
          className="t2q-btn-ghost-pro inline-flex min-h-[44px] items-center justify-center px-5"
        >
          Use as a drawing anyway
        </button>
        <button
          type="button"
          onClick={onRedo}
          className="inline-flex min-h-[44px] items-center justify-center px-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white"
        >
          Scan something else
        </button>
      </div>
    </div>
  );
}
