"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
  Camera,
  Check,
  CheckCircle,
  Image as ImageIcon,
  Receipt,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { toExGst } from "@/lib/materials/quoteExtraction";
import type { SupplierQuoteExtraction } from "@/lib/materials/quoteExtraction";
import { validateSupplierQuote } from "@/lib/materials/quoteValidation";
import { formatCurrency, round2 } from "@/lib/quote-defaults";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { prepareScanImage } from "@/lib/scanImage";
import { mergeExtractions, photoSetLabel } from "@/lib/materials/mergeExtractions";
import {
  MAX_SCAN_UPLOAD_BYTES,
  detectImageMime,
  isPreparedScanMime,
  isSupportedScanInput,
  scanUploadSizeError,
} from "@/lib/imageUpload";
import {
  createQuoteFromScan,
  importSupplierQuoteItems,
  type ScanQuoteLine,
  type SupplierQuoteRow,
} from "../../actions";

type Phase =
  | "idle"
  | "extracting"
  | "review"
  | "saving"
  | "creating"
  | "done"
  | "error";

type ReviewRow = {
  id: string;
  include: boolean;
  name: string;
  unit: string;
  quantity: string; // kept as string for the input; parsed on use
  price: string; // kept as string for the input; parsed on save
  sku: string | null;
  /** Printed line total as scanned — read-only SOURCE for reconciliation. */
  sourceLineTotal: number | null;
  lowConfidence: boolean;
  /** Exactly what the scanner read for this row — provenance for spot-checks. */
  rawText: string | null;
};

type ExtractResponse = {
  supplier: string | null;
  quote_number?: string | null;
  currency: string | null;
  gst_inclusive: boolean | null;
  items: Array<{
    name: string;
    unit: string;
    quantity?: number | null;
    pieces?: number | null;
    price: number | null;
    line_total?: number | null;
    sku: string | null;
    confidence: number;
    raw_text?: string | null;
  }>;
  subtotal?: number | null;
  gst?: number | null;
  total?: number | null;
  notes: string[];
  extraction_status?: "ok" | "needs_review" | "blocked";
  extraction_reasons?: string[];
  row_failures?: Array<{ index: number; reason: string; raw_text: string | null }>;
  warnings?: string[];
  /** Ops layer — how many AI passes ran (1 = no retry). */
  attempts?: number;
};

/** Photos per scan. Each one is a separate vision call, so keep it modest. */
export const MAX_SCAN_PHOTOS = 6;

export function QuoteImportClient({ currency, taxRate = 0.15 }: { currency: string; /** Fraction, e.g. 0.15. The tradie's configured rate, not a fixed GST. */ taxRate?: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Every chosen photo, in the order added. A multi-page quote is scanned
  // page by page and the results merged (see mergeExtractions).
  const filesRef = useRef<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string>("");
  // Object-URLs for the thumbnails, one per photo. Kept in a ref too so
  // we can revoke stale URLs on remove / replace / unmount.
  const [previews, setPreviews] = useState<string[]>([]);
  const previewsRef = useRef<string[]>([]);
  const previewUrl = previews[0] ?? "";
  const [zoomIndex, setZoomIndex] = useState<number>(0);
  const [scanProgress, setScanProgress] = useState<{ index: number; total: number } | null>(null);
  // Full-screen view of the scan so the tradie can compare each line to the
  // original photo while reviewing.
  const [zoomOpen, setZoomOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [supplier, setSupplier] = useState<string>("");
  const [gstInclusive, setGstInclusive] = useState<boolean>(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  // Document-level SOURCE totals as scanned (read-only) — reconciled against
  // the figures the app recomputes from the lines.
  const [srcSubtotal, setSrcSubtotal] = useState<number | null>(null);
  const [srcGst, setSrcGst] = useState<number | null>(null);
  const [srcTotal, setSrcTotal] = useState<number | null>(null);
  // The tradie's explicit "I've checked these, create anyway" override that
  // unblocks quote creation when reconciliation flags an error.
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  // #2 — strict-extraction verdict surfaced from the scan route.
  const [extraction, setExtraction] = useState<{
    status: "ok" | "needs_review" | "blocked";
    reasons: string[];
    rowFailures: Array<{ index: number; reason: string; raw_text: string | null }>;
    warnings: string[];
    attempts: number;
  } | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    failed: number;
  } | null>(null);

  // Revoke the last object-URL when the component unmounts.
  useEffect(() => {
    return () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  function setPreviewList(urls: string[]) {
    for (const url of previewsRef.current) if (!urls.includes(url)) URL.revokeObjectURL(url);
    previewsRef.current = urls;
    setPreviews(urls);
  }

  function clearPhotos() {
    filesRef.current = [];
    setPreviewList([]);
    setFileName("");
    setZoomIndex(0);
    if (fileRef.current) fileRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  function removePhoto(index: number) {
    filesRef.current = filesRef.current.filter((_, i) => i !== index);
    setPreviewList(previewsRef.current.filter((_, i) => i !== index));
    setFileName(photoSetLabel(filesRef.current));
    setZoomIndex(0);
  }

  function pickFile() {
    fileRef.current?.click();
  }

  function pickLibrary() {
    libraryRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    // Either input (camera capture or photo library, possibly several at
    // once) funnels here and APPENDS to the set, so a tradie can snap page
    // one, then page two, then add a price tag from their camera roll.
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setError("");
    const room = MAX_SCAN_PHOTOS - filesRef.current.length;
    if (room <= 0) {
      setError(`You can scan up to ${MAX_SCAN_PHOTOS} photos at once. Remove one to add another.`);
      return;
    }
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const f of picked.slice(0, room)) {
      const sourceSizeError = scanUploadSizeError(f);
      if (sourceSizeError) {
        problems.push(`${f.name}: ${sourceSizeError}`);
        continue;
      }
      if (!isSupportedScanInput(f)) {
        problems.push(`${f.name}: unsupported image type. Use JPEG, PNG, WebP, GIF or iPhone HEIC.`);
        continue;
      }
      accepted.push(f);
    }
    if (picked.length > room) {
      problems.push(`Only the first ${room} added — a scan holds up to ${MAX_SCAN_PHOTOS} photos.`);
    }
    filesRef.current = [...filesRef.current, ...accepted];
    setPreviewList([...previewsRef.current, ...accepted.map((f) => URL.createObjectURL(f))]);
    setFileName(photoSetLabel(filesRef.current));
    if (problems.length > 0) setError(problems.join(" "));
  }

  async function scan() {
    const raws = filesRef.current;
    if (raws.length === 0) {
      setError("Take a photo of the quote, or choose one from your phone, first.");
      return;
    }
    setError("");
    setPhase("extracting");
    setScanProgress({ index: 1, total: raws.length });
    try {
      const pages: ExtractResponse[] = [];
      const preparedFiles: File[] = [];
      const preparedUrls: string[] = [];
      // On any early exit, drop the object URLs minted for already-prepared photos.
      const abandonPrepared = () => { for (const url of preparedUrls) if (!previewsRef.current.includes(url)) URL.revokeObjectURL(url); };
      for (let i = 0; i < raws.length; i++) {
        const raw = raws[i];
        const which = raws.length > 1 ? `Photo ${i + 1} of ${raws.length}: ` : "";
        setScanProgress({ index: i + 1, total: raws.length });
        // Convert iPhone HEIC → JPEG and downscale big photos so the upload
        // clears the ~4.5 MB request-body limit (otherwise it 413s).
        let f = raw;
        try {
          f = await prepareScanImage(raw);
        } catch {
          setError(
            `${which}couldn’t read that photo. Upload a JPEG, or switch your iPhone Camera to "Most Compatible".`,
          );
          setPhase("error");
          abandonPrepared();
          return;
        }
        if (f.size > MAX_SCAN_UPLOAD_BYTES) {
          setError(
            `${which}image is ${(f.size / 1024 / 1024).toFixed(1)} MB after compression. Try cropping or taking a closer photo.`,
          );
          setPhase("error");
          abandonPrepared();
          return;
        }
        if (!isPreparedScanMime(detectImageMime(f))) {
          setError(
            `${which}unsupported image type after preparation. Use JPEG, PNG, WebP or GIF.`,
          );
          setPhase("error");
          abandonPrepared();
          return;
        }
        preparedFiles.push(f);
        preparedUrls.push(f === raw ? previewsRef.current[i] : URL.createObjectURL(f));
        const fd = new FormData();
        fd.append("image", f);
        const res = await fetch("/api/materials/extract-quote", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          setError(`${which}${data.message ?? data.error ?? "Could not scan that quote."}`);
          setPhase("error");
          abandonPrepared();
          return;
        }
        pages.push((await res.json()) as ExtractResponse);
      }
      // Keep the prepared (JPEG, downscaled) versions so the review zoom
      // shows exactly what the reader saw.
      filesRef.current = preparedFiles;
      setPreviewList(preparedUrls);
      setFileName(photoSetLabel(preparedFiles));
      const data = mergeExtractions(pages) as ExtractResponse;
      setSupplier(data.supplier ?? "");
      setGstInclusive(data.gst_inclusive === true);
      setNotes(data.notes ?? []);
      setSrcSubtotal(data.subtotal ?? null);
      setSrcGst(data.gst ?? null);
      setSrcTotal(data.total ?? null);
      setAcknowledged(false);
      setExtraction({
        status: data.extraction_status ?? "ok",
        reasons: data.extraction_reasons ?? [],
        rowFailures: data.row_failures ?? [],
        warnings: data.warnings ?? [],
        attempts: data.attempts ?? 1,
      });
      setRows(
        data.items.map((it) => ({
          id: crypto.randomUUID(),
          include: it.price !== null && it.price > 0,
          name: it.name,
          unit: it.unit,
          quantity:
            it.quantity != null
              ? String(it.quantity)
              : it.pieces != null
                ? String(it.pieces)
                : "",
          price: it.price !== null ? String(it.price) : "",
          sku: it.sku,
          sourceLineTotal: it.line_total ?? null,
          // Raised from 0.6 → 0.8: in pursuit of "1000% correct" we'd rather
          // flag a few extra lines for a 2-second eyeball than let a quiet
          // misread (smudged digit, derived unit price) through.
          lowConfidence: it.confidence < 0.8,
          rawText: it.raw_text ?? null,
        })),
      );
      setPhase("review");
    } catch {
      setError("Network error. Please try again.");
      setPhase("error");
    } finally {
      setScanProgress(null);
    }
  }

  function patchRow(id: string, patch: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  const includable = rows.filter((r) => {
    const p = Number(r.price);
    return r.include && r.name.trim() && Number.isFinite(p) && p > 0;
  });

  // A quote mirrors every ticked, named line (a $0 line is allowed — the
  // tradie can price it on the review screen).
  const createable = rows.filter((r) => r.include && r.name.trim());

  // Live reconciliation over the lines that will form the quote, using the
  // SAME deterministic validator the server runs. Drives the per-line +
  // summary badges and whether quote creation is blocked.
  const { validation, lineCheckById } = useMemo(() => {
    const createableV = rows.filter((r) => r.include && r.name.trim());
    const ext: SupplierQuoteExtraction = {
      supplier: supplier.trim() || null,
      quote_number: null,
      currency,
      gst_inclusive: gstInclusive,
      items: createableV.map((r) => ({
        name: r.name.trim(),
        unit: r.unit.trim() || "each",
        price:
          Number.isFinite(Number(r.price)) && Number(r.price) > 0
            ? Number(r.price)
            : null,
        sku: r.sku,
        quantity:
          Number.isFinite(Number(r.quantity)) && Number(r.quantity) > 0
            ? Number(r.quantity)
            : null,
        pieces: null,
        source_line_total: r.sourceLineTotal,
        raw_text: null,
        confidence: 1,
      })),
      subtotal: srcSubtotal,
      gst: srcGst,
      total: srcTotal,
      notes: [],
    };
    const report = validateSupplierQuote(ext, { taxRate });
    const map = new Map(
      createableV.map((r, i) => [r.id, report.lines[i]] as const),
    );
    return { validation: report, lineCheckById: map };
  }, [rows, supplier, currency, gstInclusive, srcSubtotal, srcGst, srcTotal]);

  // Block quote creation while an error-level mismatch is unacknowledged.
  const blocked = validation.blocking && !acknowledged;

  /** Snap a line's unit price so its line total equals the printed source. */
  function applySupplierValue(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r || r.sourceLineTotal == null) return;
    const qty = Number(r.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    patchRow(id, { price: String(round2(r.sourceLineTotal / qty)) });
  }

  async function save() {
    if (includable.length === 0) {
      setError("Tick at least one line with a name and a price above zero.");
      return;
    }
    setError("");
    setPhase("saving");
    const payload: SupplierQuoteRow[] = includable.map((r) => ({
      name: r.name.trim(),
      unit: r.unit.trim() || "each",
      default_unit_price: toExGst(Number(r.price), gstInclusive, taxRate),
      sku: r.sku,
      notes: null,
    }));
    try {
      const res = await importSupplierQuoteItems(
        payload,
        supplier.trim() || null,
      );
      if (res.error) {
        setError(res.error);
        setPhase("review");
        return;
      }
      setResult({
        inserted: res.inserted,
        updated: res.updated,
        failed: res.failed,
      });
      setPhase("done");
    } catch {
      setError("Could not save to your library. Please try again.");
      setPhase("review");
    }
  }

  async function createQuote() {
    const quoteLines: ScanQuoteLine[] = createable.map((r) => ({
      name: r.name.trim(),
      unit: r.unit.trim() || "each",
      quantity: Number(r.quantity) || 0,
      price: Number(r.price) || 0,
      line_total: r.sourceLineTotal,
    }));
    if (quoteLines.length === 0) {
      setError("Tick at least one line with a name to build a quote.");
      return;
    }
    setError("");
    setPhase("creating");
    try {
      const res = await createQuoteFromScan(quoteLines, {
        supplier: supplier.trim() || null,
        gstInclusive,
        subtotal: srcSubtotal,
        gst: srcGst,
        total: srcTotal,
        acknowledge: acknowledged,
        extractionStatus: extraction?.status,
        extractionReasons: extraction?.reasons,
        rowFailures: extraction?.rowFailures,
        extractionAttempts: extraction?.attempts,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Could not create the quote.");
        setPhase("review");
        return;
      }
      // Land on the normal review-your-quote screen with the mirror.
      router.push(`/app/quotes/preview/${res.id}`);
    } catch {
      setError("Could not create the quote. Please try again.");
      setPhase("review");
    }
  }

  // ── Done state ──────────────────────────────────────────────────────
  if (phase === "done" && result) {
    return (
      <section className="t2q-card-pro mt-6 p-5 sm:p-6" data-testid="quote-import-done">
        <div className="flex items-start gap-3">
          <CheckCircle size={24} weight="fill" className="mt-0.5 shrink-0 text-brand" />
          <div>
            <h2 className="font-display text-lg uppercase tracking-tight text-white">
              Added to your library.
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              {result.inserted} new, {result.updated} updated
              {result.failed > 0 ? `, ${result.failed} failed` : ""}. These
              prices are marked as scanned estimates — confirm them with the
              supplier before relying on them.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/app/materials" className="t2q-btn-primary-pro inline-flex h-11 px-5">
            View library
          </Link>
          <button
            type="button"
            onClick={() => {
              setRows([]);
              setResult(null);
              setFileName("");
              setSupplier("");
              setNotes([]);
              setExtraction(null);
              clearPhotos();
              setPhase("idle");
            }}
            className="t2q-btn-ghost-pro inline-flex h-11 px-5"
          >
            <Camera size={18} weight="bold" />
            Scan another
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        className="sr-only"
        onChange={onFileChosen}
        data-testid="quote-import-file"
      />
      {/* Photo-library import — no `capture`, so mobile offers the gallery
          / file picker instead of forcing the camera. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onChange={onFileChosen}
        data-testid="quote-import-file-library"
      />

      {/* Upload + scan */}
      {(phase === "idle" || phase === "extracting" || phase === "error") && (
        <div className="t2q-card-pro p-5 sm:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
            {"// step 1 — photos"}
          </div>
          <p className="mt-2 text-sm text-ink-300">
            Take a photo now, or pick photos already on your phone. Add every page
            of a long quote — up to {MAX_SCAN_PHOTOS} photos are read together.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={pickFile}
              disabled={phase === "extracting"}
              className="t2q-btn-ghost-pro inline-flex h-11 px-5 disabled:opacity-50"
            >
              <Camera size={18} weight="bold" />
              {previews.length > 0 ? "Add a photo" : "Take photo"}
            </button>
            <button
              type="button"
              onClick={pickLibrary}
              disabled={phase === "extracting"}
              className="t2q-btn-ghost-pro inline-flex h-11 px-5 disabled:opacity-50"
              data-testid="quote-import-library-btn"
            >
              <ImageIcon size={18} weight="bold" />
              {previews.length > 0 ? "Add from Photos" : "Choose from Photos"}
            </button>
          </div>
          {previews.length > 0 && (
            <div
              data-testid="quote-import-preview"
              className="mt-4 rounded-lg border border-ink-800 bg-ink-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-500">
                  <CheckCircle size={14} weight="fill" />
                  {previews.length === 1 ? "Photo ready" : `${previews.length} photos ready`}
                </p>
                <button
                  type="button"
                  onClick={clearPhotos}
                  disabled={phase === "extracting"}
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 hover:text-red-300 disabled:opacity-50"
                  data-testid="quote-import-clear"
                >
                  Clear all
                </button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Photos to scan">
                {previews.map((url, i) => (
                  <li key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Photo ${i + 1} of ${previews.length}`}
                      className="h-20 w-20 rounded-md border border-[#E0DFD7] object-cover"
                    />
                    <span className="absolute bottom-1 left-1 rounded-sm bg-black/70 px-1 font-mono text-[10px] text-white">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => removePhoto(i)}
                      disabled={phase === "extracting"}
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-ink-700 bg-ink-950 text-ink-200 hover:text-red-300 disabled:opacity-50"
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 truncate text-xs text-ink-500" data-testid="quote-import-filename">
                {fileName} · tap “Scan” to read the lines.
              </p>
            </div>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={scan}
              disabled={phase === "extracting" || !fileName}
              data-testid="quote-import-scan"
              className="t2q-btn-primary-pro inline-flex h-11 px-5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "extracting"
                ? scanProgress && scanProgress.total > 1
                  ? `Reading photo ${scanProgress.index} of ${scanProgress.total}…`
                  : "Reading quote…"
                : previews.length > 1
                  ? `Scan ${previews.length} photos`
                  : "Scan quote"}
            </button>
          </div>
          {phase === "extracting" && (
            <div className="mt-4 flex justify-center">
              <TapeMeasureProgress
                estimateMs={18000 * Math.max(1, previews.length)}
                label={scanProgress && scanProgress.total > 1 ? `// photo ${scanProgress.index} of ${scanProgress.total}` : "// reading quote"}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          data-testid="quote-import-error"
          className="mt-4 rounded-sm border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {/* Review */}
      {(phase === "review" || phase === "saving" || phase === "creating") && (
        <div className="mt-4 space-y-4">
          <div className="t2q-card-pro p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
                {"// step 2 — check the lines"}
              </div>
              {previewUrl && (
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  data-testid="quote-import-view-scan"
                  className="inline-flex items-center gap-1.5 rounded-sm border border-ink-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-200 hover:border-brand hover:text-brand"
                >
                  <ImageIcon size={13} weight="bold" />
                  View scan
                </button>
              )}
            </div>
            {(() => {
              const n = rows.filter((r) => r.lowConfidence).length;
              if (n === 0) return null;
              return (
                <p
                  data-testid="quote-import-lowconf-tally"
                  className="mt-2 flex items-center gap-1.5 rounded-sm border border-hivis/40 bg-hivis/10 px-2.5 py-1.5 text-xs text-hivis"
                >
                  <Warning size={13} weight="fill" className="shrink-0" />
                  {n} line{n === 1 ? "" : "s"} to double-check — the amber ones
                  below show what the scanner read; tap “View scan” to compare.
                </p>
              );
            })()}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <label className="flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  Supplier
                </span>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. ITM"
                  className="mt-1 w-full rounded-sm border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={gstInclusive}
                  onChange={(e) => setGstInclusive(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                  data-testid="quote-import-gst"
                />
                <span className="text-sm text-ink-200">Prices include GST</span>
              </label>
            </div>
            {notes.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-sm border border-hivis/30 bg-hivis/5 p-3">
                <li className="font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
                  {"// double-check"}
                </li>
                {notes.map((n, i) => (
                  <li key={i} className="text-xs text-ink-200">
                    {n}
                  </li>
                ))}
              </ul>
            )}
            {extraction &&
              (extraction.status !== "ok" ||
                extraction.rowFailures.length > 0 ||
                extraction.warnings.length > 0) && (
                <div
                  data-testid="quote-import-extraction"
                  data-status={extraction.status}
                  className={`mt-3 rounded-sm border p-3 ${
                    extraction.status === "blocked"
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-hivis/40 bg-hivis/5"
                  }`}
                >
                  <p
                    className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
                      extraction.status === "blocked" ? "text-red-300" : "text-hivis"
                    }`}
                  >
                    {extraction.status === "blocked"
                      ? "// extraction incomplete — re-scan recommended"
                      : "// extraction needs review"}
                  </p>
                  {extraction.reasons.map((r, i) => (
                    <p key={`r${i}`} className="mt-1 text-xs text-ink-200">
                      {r}
                    </p>
                  ))}
                  {extraction.rowFailures.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {extraction.rowFailures.map((f, i) => (
                        <li key={`f${i}`} className="text-xs text-red-300">
                          · row {f.index + 1}: {f.reason}
                          {f.raw_text ? ` ("${f.raw_text}")` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {extraction.warnings.map((w, i) => (
                    <p key={`w${i}`} className="mt-1 text-xs text-ink-300">
                      {w}
                    </p>
                  ))}
                </div>
              )}
          </div>

          <ul className="space-y-2" data-testid="quote-import-rows">
            {rows.map((r) => {
              const priceNum = Number(r.price);
              const badPrice = !Number.isFinite(priceNum) || priceNum <= 0;
              return (
                <li
                  key={r.id}
                  className={`rounded-sm border p-3 ${r.include ? "border-ink-700 bg-ink-900/60" : "border-ink-800 bg-ink-950/40 opacity-60"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => patchRow(r.id, { include: e.target.checked })}
                      className="mt-2 h-4 w-4 shrink-0 accent-brand"
                      aria-label="Include this line"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => patchRow(r.id, { name: e.target.value })}
                        className="w-full rounded-sm border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={r.quantity}
                          onChange={(e) => patchRow(r.id, { quantity: e.target.value })}
                          aria-label="Quantity"
                          placeholder="Qty"
                          className="w-16 rounded-sm border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                        />
                        <input
                          type="text"
                          value={r.unit}
                          onChange={(e) => patchRow(r.id, { unit: e.target.value })}
                          aria-label="Unit"
                          className="w-20 rounded-sm border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                        />
                        <div className="inline-flex items-center rounded-sm border border-ink-700 bg-ink-900 focus-within:border-brand">
                          <span className="pl-2 font-mono text-xs text-ink-400">
                            {currency}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={r.price}
                            onChange={(e) => patchRow(r.id, { price: e.target.value })}
                            aria-label="Unit price"
                            className={`w-24 bg-transparent px-2 py-1.5 text-sm outline-none ${badPrice && r.include ? "text-red-300" : "text-white"}`}
                          />
                        </div>
                        {r.sku && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-500">
                            {r.sku}
                          </span>
                        )}
                        {r.lowConfidence && (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-hivis/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-hivis">
                            <Warning size={10} weight="fill" />
                            check
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          aria-label="Remove line"
                          className="ml-auto text-ink-500 hover:text-red-300"
                        >
                          <Trash size={16} weight="bold" />
                        </button>
                      </div>
                      {badPrice && r.include && (
                        <p className="mt-1 text-[11px] text-red-300">
                          Add a price above zero, or untick this line.
                        </p>
                      )}
                      {r.rawText && (
                        <p
                          data-testid="quote-import-rawtext"
                          className={`mt-1.5 break-words font-mono text-[10px] leading-snug ${
                            r.lowConfidence ? "text-hivis" : "text-ink-500"
                          }`}
                        >
                          <span className="opacity-70">Scanned as: </span>
                          {r.rawText}
                        </p>
                      )}
                      {(() => {
                        const check = lineCheckById.get(r.id)?.checks[0];
                        if (!r.include || !check || check.found == null) {
                          return null;
                        }
                        const mismatch = check.severity === "error";
                        return (
                          <div
                            data-testid="quote-import-line-reconcile"
                            className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${
                              mismatch ? "text-red-300" : "text-ink-400"
                            }`}
                          >
                            <span>
                              Supplier:{" "}
                              <span className="tabular-nums text-ink-200">
                                {formatCurrency(check.found, currency)}
                              </span>
                            </span>
                            <span>
                              App (qty×price):{" "}
                              <span className="tabular-nums">
                                {check.expected != null
                                  ? formatCurrency(check.expected, currency)
                                  : "—"}
                              </span>
                            </span>
                            {mismatch && (
                              <>
                                <span className="inline-flex items-center gap-1 rounded-sm bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-red-300">
                                  <Warning size={10} weight="fill" />
                                  mismatch
                                </span>
                                <button
                                  type="button"
                                  onClick={() => applySupplierValue(r.id)}
                                  data-testid="quote-import-use-supplier"
                                  className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-brand hover:text-brand-300"
                                >
                                  <ArrowsClockwise size={10} weight="bold" />
                                  use supplier value
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {(srcSubtotal != null || srcGst != null || srcTotal != null) && (
            <div
              className="t2q-card-pro p-4 sm:p-5"
              data-testid="quote-import-reconcile"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
                {"// reconciliation — supplier vs app"}
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-[#E8E7E0]">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="bg-ink-900 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-400">
                      <th className="px-3 py-2 text-left font-medium">Field</th>
                      <th className="px-3 py-2 text-right font-medium">Supplier</th>
                      <th className="px-3 py-2 text-right font-medium">App</th>
                      <th className="px-2 py-2" aria-label="Status" />
                    </tr>
                  </thead>
                  <tbody>
                    {validation.summary.map((c) => {
                      const bad = c.severity === "error";
                      const warn = c.severity === "warning";
                      return (
                        <tr key={c.field} className="border-t border-[#ECEBE4]">
                          <td className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-500">
                            {c.field}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-600">
                            {c.found != null
                              ? formatCurrency(c.found, currency)
                              : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${
                              bad ? "text-red-300" : "text-ink-900"
                            }`}
                          >
                            {c.expected != null
                              ? formatCurrency(c.expected, currency)
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {bad && (
                              <span className="inline-block rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-red-300">
                                mismatch
                              </span>
                            )}
                            {warn && (
                              <span className="inline-block rounded bg-hivis/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-hivis">
                                check
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {validation.blocking && (
            <div
              className="rounded-lg border border-red-500/50 bg-red-500/10 p-4"
              data-testid="quote-import-block"
            >
              <p className="flex items-start gap-2 text-sm font-semibold text-red-200">
                <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
                <span>
                  Some numbers don&rsquo;t reconcile with the supplier quote
                  (flagged above). Fix them — or tap &ldquo;use supplier
                  value&rdquo; — then create.
                </span>
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                  data-testid="quote-import-acknowledge"
                />
                I&rsquo;ve checked these — create anyway
              </label>
            </div>
          )}

          <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-sm border border-ink-700 bg-ink-950/95 p-3 shadow-lg">
            <button
              type="button"
              onClick={createQuote}
              disabled={
                phase === "creating" ||
                phase === "saving" ||
                createable.length === 0 ||
                blocked
              }
              data-testid="quote-import-create"
              className="t2q-btn-primary-pro inline-flex h-11 px-5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Receipt size={18} weight="bold" />
              {phase === "creating"
                ? "Building quote…"
                : `Create quote (${createable.length})`}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={
                phase === "saving" ||
                phase === "creating" ||
                includable.length === 0
              }
              data-testid="quote-import-save"
              className="t2q-btn-ghost-pro inline-flex h-11 px-5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={18} weight="bold" />
              {phase === "saving"
                ? "Saving…"
                : `Add ${includable.length} to library`}
            </button>
            <Link href="/app/materials" className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-ink-100">
              Cancel
            </Link>
          </div>
        </div>
      )}

      {/* Full-screen scan viewer — lets the tradie zoom the original photo to
          verify any flagged line against the source. */}
      {zoomOpen && previews.length > 0 && (
        <div
          data-testid="quote-import-scan-zoom"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            aria-label="Close scan view"
            onClick={() => setZoomOpen(false)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={20} weight="bold" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previews[Math.min(zoomIndex, previews.length - 1)]}
            alt={`Scanned supplier quote, photo ${Math.min(zoomIndex, previews.length - 1) + 1} of ${previews.length}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          {previews.length > 1 && (
            <div
              className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-3 py-1.5 text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => setZoomIndex((i) => (i - 1 + previews.length) % previews.length)}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
              >
                ‹
              </button>
              <span className="font-mono text-xs">
                {Math.min(zoomIndex, previews.length - 1) + 1} / {previews.length}
              </span>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => setZoomIndex((i) => (i + 1) % previews.length)}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
