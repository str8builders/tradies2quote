"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { uploadSupplierDocument } from "@/lib/materials/scan-upload";
import { ReviewToolbar, useReviewTable } from "@/components/review-table";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
  Camera,
  Check,
  CheckCircle,
  FilePdf,
  Image as ImageIcon,
  Receipt,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { preciseUnitPrice, unitPriceExGst } from "@/lib/materials/quoteExtraction";
import type { SupplierQuoteExtraction } from "@/lib/materials/quoteExtraction";
import { validateSupplierQuote } from "@/lib/materials/quoteValidation";
import { formatCurrency } from "@/lib/quote-defaults";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { AiConsentModal } from "@/app/app/quotes/new/_components/AiConsentModal";
import { prepareScanImage } from "@/lib/scanImage";
import { mergeExtractions, pageFingerprint, photoSetLabel, type ScanPage } from "@/lib/materials/mergeExtractions";
import { buildReviewRows, type ScanReviewRow } from "@/lib/materials/scanReview";
import { createPhotoDeduper } from "@/lib/materials/scanDedupe";
import { answerPage, readPagesInTurn } from "@/lib/materials/scanPages";
import {
  keepMoreReliable,
  librarySaveOutcome,
  mergeRepeatedNames,
  type SaveOutcome,
} from "@/lib/materials/libraryImport";
import { ScanGstNote } from "./ScanGstNote";
import { QuoteImportDone } from "./QuoteImportDone";
import {
  MAX_SCAN_UPLOAD_BYTES,
  SCAN_DOC_ACCEPT,
  detectImageMime,
  isPdfFile,
  isPreparedScanMime,
  isSupportedScanInput,
  pdfUploadSizeError,
  scanUploadSizeError,
} from "@/lib/imageUpload";
import {
  createQuoteFromScan,
  importSupplierQuoteItems,
  type ScanQuoteLine,
  type SupplierImportResult,
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

type ReviewRow = ScanReviewRow;

/** One page as /api/materials/extract-quote returns it (the printed line
 *  total arrives as `source_line_total`). */
type ExtractResponse = ScanPage;

/** Photos (or PDFs) per scan. Each one is a separate vision call, so keep it modest. */
export const MAX_SCAN_PHOTOS = 6;

/** A page that was read, kept so a retried page can be merged in beside it. */
type ReadPage = { source: number; page: ExtractResponse; url: string };
/** A page that couldn't be read: the tradie can try just this one again. */
type FailedPage = { source: number; name: string; error: string };

/** A usable price: above zero, or negative on a printed discount line. */
function validRowPrice(r: ReviewRow): boolean {
  if (r.price.trim() === "") return false;
  const p = Number(r.price);
  return Number.isFinite(p) && (p > 0 || (r.credit && p < 0));
}

export function QuoteImportClient({ currency, taxRate = 0.15, taxLabel = "GST", needsAiConsent = false }: { currency: string; /** Fraction, e.g. 0.15. The tradie's configured rate, not a fixed GST. */ taxRate?: number; /** The tradie's own tax label ("GST", "VAT", "Tax"). */ taxLabel?: string; /** iPhone app with no AI consent on record: ask before the first read. */ needsAiConsent?: boolean }) {
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
  // The picked files' names, for the PDF tiles (the files themselves live in a ref).
  const [pickedNames, setPickedNames] = useState<string[]>([]);
  const previewsRef = useRef<string[]>([]);
  const [zoomIndex, setZoomIndex] = useState<number>(0);
  const [scanProgress, setScanProgress] = useState<{ index: number; total: number } | null>(null);
  // Full-screen view of the scan so the tradie can compare each line to the
  // original photo while reviewing.
  const [zoomOpen, setZoomOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [supplier, setSupplier] = useState<string>("");
  const [gstInclusive, setGstInclusive] = useState<boolean>(false);
  // What the scan itself read: true / false, or null when it couldn't tell
  // (then the prices are treated as ex-GST and the review says so).
  const [gstDetected, setGstDetected] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  // Document-level SOURCE totals as scanned (read-only) — reconciled against
  // the figures the app recomputes from the lines.
  const [srcSubtotal, setSrcSubtotal] = useState<number | null>(null);
  const [srcGst, setSrcGst] = useState<number | null>(null);
  const [srcTotal, setSrcTotal] = useState<number | null>(null);
  // Totals-block adjustments as scanned (freight, account discount, other).
  const [srcDiscount, setSrcDiscount] = useState<number | null>(null);
  const [srcFreight, setSrcFreight] = useState<number | null>(null);
  const [srcAdjustments, setSrcAdjustments] = useState<number | null>(null);
  // Pages read so far (a retried page merges in beside them) and pages that
  // failed, which the tradie can try again one at a time.
  const readPagesRef = useRef<ReadPage[]>([]);
  const [failedPages, setFailedPages] = useState<FailedPage[]>([]);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [scanViews, setScanViews] = useState<string[]>([]);
  // App Store 5.1.2(i): in the iPhone app, consent comes before the first read.
  const consentNeededRef = useRef<boolean>(needsAiConsent);
  const [consentOpen, setConsentOpen] = useState<boolean>(false);
  const consentResolve = useRef<((granted: boolean) => void) | null>(null);
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
  const [result, setResult] = useState<(SupplierImportResult & { outcome: SaveOutcome }) | null>(null);

  // Revoke the object-URLs when the component unmounts.
  const scanViewsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url);
      for (const url of scanViewsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  function setPreviewList(urls: string[]) {
    for (const url of previewsRef.current) if (url && !urls.includes(url)) URL.revokeObjectURL(url);
    previewsRef.current = urls;
    setPreviews(urls);
  }

  /** The prepared photos the reader saw, for "View scan" (PDFs have none). */
  function setScanViewList(urls: string[]) {
    for (const url of scanViewsRef.current) {
      if (!urls.includes(url) && !previewsRef.current.includes(url)) URL.revokeObjectURL(url);
    }
    scanViewsRef.current = urls;
    setScanViews(urls);
  }

  function clearPhotos() {
    filesRef.current = [];
    setPickedNames([]);
    setPreviewList([]);
    setFileName("");
    setZoomIndex(0);
    setFailedPages([]);
    if (fileRef.current) fileRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  function removePhoto(index: number) {
    filesRef.current = filesRef.current.filter((_, i) => i !== index);
    setPickedNames(filesRef.current.map((f) => f.name));
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
    // Either input (camera capture or photos / files, possibly several at
    // once) funnels here and APPENDS to the set, so a tradie can snap page
    // one, then page two, then add a PDF from the Files app.
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setError("");
    const room = MAX_SCAN_PHOTOS - filesRef.current.length;
    if (room <= 0) {
      setError(`You can scan up to ${MAX_SCAN_PHOTOS} photos or PDFs at once. Remove one to add another.`);
      return;
    }
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const f of picked.slice(0, room)) {
      if (isPdfFile(f)) {
        const pdfError = pdfUploadSizeError(f);
        if (pdfError) problems.push(`${f.name}: ${pdfError}`);
        else accepted.push(f);
        continue;
      }
      const sourceSizeError = scanUploadSizeError(f);
      if (sourceSizeError) {
        problems.push(`${f.name}: ${sourceSizeError}`);
        continue;
      }
      if (!isSupportedScanInput(f)) {
        problems.push(`${f.name}: unsupported file type. Use a photo (JPEG, PNG, WebP, GIF or iPhone HEIC) or a PDF.`);
        continue;
      }
      accepted.push(f);
    }
    if (picked.length > room) {
      problems.push(`Only the first ${room} added — a scan holds up to ${MAX_SCAN_PHOTOS} photos or PDFs.`);
    }
    filesRef.current = [...filesRef.current, ...accepted];
    setPickedNames(filesRef.current.map((f) => f.name));
    // PDFs have no thumbnail: an empty entry keeps the list in step.
    setPreviewList([...previewsRef.current, ...accepted.map((f) => (isPdfFile(f) ? "" : URL.createObjectURL(f)))]);
    setFileName(photoSetLabel(filesRef.current));
    if (problems.length > 0) setError(problems.join(" "));
  }

  /** Show the consent step; resolves once the tradie agrees ("Not now" leaves the page). */
  function askConsent(): Promise<boolean> {
    return new Promise((resolve) => {
      consentResolve.current = resolve;
      setConsentOpen(true);
    });
  }

  function onConsentGranted() {
    consentNeededRef.current = false;
    setConsentOpen(false);
    consentResolve.current?.(true);
    consentResolve.current = null;
  }

  /** "Photo 2 of 3: " when there's more than one page; nothing for one. */
  function pageLabel(source: number, total: number): string {
    if (total <= 1) return "";
    const f = filesRef.current[source];
    return `${f && isPdfFile(f) ? "PDF" : "Photo"} ${source + 1} of ${total}: `;
  }

  /**
   * Get one page ready to send: a photo is converted / downscaled / stripped
   * of EXIF (prepareScanImage); a PDF goes as it is. Returns the error to
   * show instead when the page can't be sent.
   */
  async function preparePage(raw: File): Promise<{ file: File; url: string } | { error: string }> {
    if (isPdfFile(raw)) return { file: raw, url: "" };
    let f = raw;
    try {
      f = await prepareScanImage(raw);
    } catch {
      return { error: `couldn’t read that photo. Upload a JPEG, or switch your iPhone Camera to "Most Compatible".` };
    }
    if (f.size > MAX_SCAN_UPLOAD_BYTES) {
      return { error: `image is ${(f.size / 1024 / 1024).toFixed(1)} MB after compression. Try cropping or taking a closer photo.` };
    }
    if (!isPreparedScanMime(detectImageMime(f))) {
      return { error: "unsupported image type after preparation. Use JPEG, PNG, WebP or GIF." };
    }
    return { file: f, url: URL.createObjectURL(f) };
  }

  /** Put the merged read of every page that worked on the review screen. */
  function applyPages(pages: ReadPage[], extraWarnings: string[], keepRows: boolean, newRows: ReviewRow[]) {
    const data = mergeExtractions(pages.map((p) => p.page), pages.map((p) => p.source + 1));
    if (!keepRows || !supplier.trim()) setSupplier(data.supplier ?? "");
    if (!keepRows) {
      setGstInclusive(data.gst_inclusive === true);
      setGstDetected(data.gst_inclusive ?? null);
    }
    setNotes(data.notes ?? []);
    setSrcSubtotal(data.subtotal ?? null);
    setSrcGst(data.gst ?? null);
    setSrcTotal(data.total ?? null);
    setSrcDiscount(data.discount ?? null);
    setSrcFreight(data.freight ?? null);
    setSrcAdjustments(data.adjustments ?? null);
    setAcknowledged(false);
    setExtraction((prev) => ({
      status: data.extraction_status ?? "ok",
      reasons: data.extraction_reasons ?? [],
      rowFailures: data.row_failures ?? [],
      warnings: [...(keepRows ? (prev?.warnings ?? []).filter((w) => !(data.warnings ?? []).includes(w)) : []), ...extraWarnings, ...(data.warnings ?? [])],
      attempts: data.attempts ?? 1,
    }));
    setScanViewList(pages.map((p) => p.url).filter(Boolean));
    if (keepRows) {
      // Keep the tradie's edits; the retried page's lines go on the end.
      setRows((current) => [...current, ...newRows]);
    } else {
      setHistory([]);
      // Low-confidence threshold is 0.8: we'd rather flag a few extra lines
      // for a 2-second eyeball than let a quiet misread through.
      setRows(buildReviewRows(data.items, () => crypto.randomUUID()));
    }
  }

  const scanAbort=useRef<AbortController|null>(null);
  const [uploadPercent,setUploadPercent]=useState(0);
  useEffect(()=>()=>scanAbort.current?.abort(),[]);
  async function scan() {
    if(scanAbort.current)return;
    const raws = filesRef.current;
    if (raws.length === 0) {
      setError("Take a photo of the quote, or choose photos or a PDF from your phone, first.");
      return;
    }
    const controller=new AbortController();scanAbort.current=controller;
    setUploadPercent(0);
    setError("");
    setFailedPages([]);
    setPhase("extracting");
    setScanProgress({ index: 1, total: raws.length });
    const unused: string[] = [];
    try {
      // The same photo added twice is skipped before upload (hash of the
      // prepared bytes) — scanning both doubled every line and total.
      const dedupe = createPhotoDeduper();
      const skippedNotes: string[] = [];
      const failed: FailedPage[] = [];
      const ready: Array<{ source: number; file: File; url: string }> = [];
      for (let i = 0; i < raws.length; i++) {
        controller.signal.throwIfAborted();
        setScanProgress({ index: i + 1, total: raws.length });
        const prepared = await preparePage(raws[i]);
        if ("error" in prepared) {
          failed.push({ source: i, name: raws[i].name, error: prepared.error });
          continue;
        }
        if (prepared.url) unused.push(prepared.url);
        const samePhoto = await dedupe.check(prepared.file, i + 1);
        if (samePhoto !== null) {
          skippedNotes.push(`${isPdfFile(raws[i]) ? "PDF" : "Photo"} ${i + 1} is the same file as number ${samePhoto}, so it was skipped.`);
          continue;
        }
        ready.push({ source: i, ...prepared });
      }

      const run = await readPagesInTurn<ExtractResponse>({
        indexes: ready.map((_, k) => k),
        consentNeeded: consentNeededRef.current,
        askConsent,
        onPage: (_k, position) => {
          setUploadPercent(0);
          setScanProgress({ index: position + 1, total: ready.length });
        },
        read: (k) =>
          answerPage<ExtractResponse>(() =>
            uploadSupplierDocument(ready[k].file, { signal: controller.signal, onProgress: setUploadPercent, mode: "quote" }),
          ),
      });
      if (run.declined) {
        setPhase("idle");
        return;
      }
      const pages: ReadPage[] = [];
      for (const o of run.outcomes) {
        const page = ready[o.index];
        if (o.ok) pages.push({ source: page.source, page: o.page, url: page.url });
        else failed.push({ source: page.source, name: raws[page.source].name, error: o.error });
      }
      failed.sort((a, b) => a.source - b.source);
      if (pages.length === 0) {
        setError(failed.map((f) => `${pageLabel(f.source, raws.length)}${f.error}`).join(" ") || "Could not scan that quote.");
        setPhase("error");
        return;
      }
      readPagesRef.current = pages;
      setFailedPages(failed);
      applyPages(pages, skippedNotes, false, []);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error?e.message:"Network error. Please try again.");
      setPhase("error");
    } finally {
      for (const url of unused) if (!scanViewsRef.current.includes(url)) URL.revokeObjectURL(url);
      scanAbort.current=null;
      setScanProgress(null);
    }
  }

  /** Try one page that failed again, and add its lines to the review. */
  async function retryPage(source: number) {
    if (scanAbort.current || retrying !== null) return;
    const raw = filesRef.current[source];
    if (!raw) return;
    const controller = new AbortController();
    scanAbort.current = controller;
    setRetrying(source);
    setUploadPercent(0);
    let url = "";
    const setFailure = (message: string) =>
      setFailedPages((list) => list.map((f) => (f.source === source ? { ...f, error: message } : f)));
    try {
      const prepared = await preparePage(raw);
      if ("error" in prepared) {
        setFailure(prepared.error);
        return;
      }
      url = prepared.url;
      const run = await readPagesInTurn<ExtractResponse>({
        indexes: [0],
        consentNeeded: consentNeededRef.current,
        askConsent,
        read: () =>
          answerPage<ExtractResponse>(() =>
            uploadSupplierDocument(prepared.file, { signal: controller.signal, onProgress: setUploadPercent, mode: "quote" }),
          ),
      });
      const outcome = run.outcomes[0];
      if (!outcome) return;
      if (!outcome.ok) {
        setFailure(outcome.error);
        return;
      }
      setFailedPages((list) => list.filter((f) => f.source !== source));
      const fingerprint = pageFingerprint(outcome.page);
      const same = readPagesRef.current.find((p) => fingerprint && pageFingerprint(p.page) === fingerprint);
      if (same) {
        setExtraction((prev) =>
          prev ? { ...prev, warnings: [...prev.warnings, `Number ${source + 1} is the same page as number ${same.source + 1}, so its lines weren't added twice.`] } : prev,
        );
        return;
      }
      const pages = [...readPagesRef.current, { source, page: outcome.page, url }].sort((a, b) => a.source - b.source);
      readPagesRef.current = pages;
      url = "";
      applyPages(pages, [], true, buildReviewRows(outcome.page.items, () => crypto.randomUUID()));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Network error. Please try again.");
    } finally {
      if (url) URL.revokeObjectURL(url);
      scanAbort.current = null;
      setRetrying(null);
    }
  }

  const [history, setHistory] = useState<ReviewRow[][]>([]);
  function changeRows(next: ReviewRow[]) {
    setHistory(old => [...old.slice(-39), rows]);
    setRows(next);
    setAcknowledged(false);
  }
  function patchRow(id: string, patch: Partial<ReviewRow>) {
    changeRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function removeRow(id: string) { changeRows(rows.filter(r => r.id !== id)); }
  function undoRows() {
    if (!history.length) return;
    setRows(history[history.length - 1]); setHistory(history.slice(0, -1)); setAcknowledged(false);
  }
  const [bulk, setBulk] = useState<{ids: string[]; include: boolean} | null>(null);
  function applyBulk() {
    if (!bulk) return;
    const ids = new Set(bulk.ids);
    changeRows(rows.map(r => ids.has(r.id) ? {...r, include: bulk.include} : r)); setBulk(null);
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
        // Full precision; a discount line keeps its negative price.
        price:
          r.price.trim() !== "" && Number.isFinite(Number(r.price)) && Number(r.price) !== 0
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
      discount: srcDiscount,
      freight: srcFreight,
      adjustments: srcAdjustments,
      notes: [],
    };
    const report = validateSupplierQuote(ext, { taxRate });
    const map = new Map(
      createableV.map((r, i) => [r.id, report.lines[i]] as const),
    );
    return { validation: report, lineCheckById: map };
  }, [rows, supplier, currency, gstInclusive, srcSubtotal, srcGst, srcTotal, srcDiscount, srcFreight, srcAdjustments, taxRate]);

  const reviewEntries = useMemo(() => rows.map(r => ({ id: r.id, value: r, label: r.name, search: [r.name, r.sku, r.rawText].join(" "), amount: Number(r.price) || 0, attention: !!lineCheckById.get(r.id)?.checks.some(check=>check.severity!=="ok") || r.lowConfidence || !r.name.trim() || !validRowPrice(r) || !(Number(r.quantity) > 0) })), [rows,lineCheckById]);
  const review = useReviewTable(reviewEntries);

  // Block quote creation AND saving to the library while an error-level
  // mismatch is unacknowledged: a wrong scanned price would otherwise go
  // straight into every future quote.
  const blocked = validation.blocking && !acknowledged;

  // A name on more than one line is saved to the library once (the clearest
  // read) — say so before the tradie saves.
  const libraryMerges = mergeRepeatedNames(
    includable.map((r) => ({ name: r.name.trim(), unit: r.unit, default_unit_price: Number(r.price), sku: r.sku, supplier: null, supplier_url: null, notes: null, confidence: r.confidence })),
    keepMoreReliable,
  ).merged;

  /** Snap a line's unit price so its line total equals the printed source.
   *  Full precision — rounding to the cent can't reconcile 1000 × $0.125. */
  function applySupplierValue(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r || r.sourceLineTotal == null) return;
    const qty = Number(r.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    patchRow(id, { price: String(preciseUnitPrice(r.sourceLineTotal / qty)) });
  }

  async function save() {
    if (includable.length === 0) {
      setError("Tick at least one line with a name and a price above zero.");
      return;
    }
    if (blocked) {
      setError("Some numbers don’t add up. Fix the flagged lines, or tick “I’ve checked these”, then add them.");
      return;
    }
    setError("");
    setPhase("saving");
    const payload: SupplierQuoteRow[] = includable.map((r) => ({
      name: r.name.trim(),
      unit: r.unit.trim() || "each",
      // Library prices are ex-GST unit prices at full precision.
      default_unit_price: unitPriceExGst(Number(r.price), gstInclusive, taxRate),
      sku: r.sku,
      notes: null,
      confidence: r.confidence,
    }));
    try {
      const res = await importSupplierQuoteItems(
        payload,
        supplier.trim() || null,
      );
      if (res.error && res.inserted + res.updated === 0 && res.failed === 0) {
        setError(res.error);
        setPhase("review");
        return;
      }
      // Nothing saved is shown as an error, never "Added to your library".
      setResult({ ...res, outcome: librarySaveOutcome(res) });
      setPhase("done");
    } catch {
      setError("Could not save to your library. Please try again.");
      setPhase("review");
    }
  }

  const createAttempt = useRef<{key: string; signature: string} | null>(null);
  const savingLock = useRef(false);
  async function createQuote() {
    if (savingLock.current) return;
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
    savingLock.current = true;
    const signature = JSON.stringify({quoteLines, supplier, gstInclusive, srcSubtotal, srcGst, srcTotal, srcDiscount, srcFreight, srcAdjustments, acknowledged, extraction});
    if (createAttempt.current?.signature !== signature) createAttempt.current = {key: crypto.randomUUID(), signature};
    try {
      const res = await createQuoteFromScan(quoteLines, {
        supplier: supplier.trim() || null,
        gstInclusive,
        subtotal: srcSubtotal,
        gst: srcGst,
        total: srcTotal,
        discount: srcDiscount,
        freight: srcFreight,
        adjustments: srcAdjustments,
        acknowledge: acknowledged,
        extractionStatus: extraction?.status,
        extractionReasons: extraction?.reasons,
        rowFailures: extraction?.rowFailures,
        extractionAttempts: extraction?.attempts,
        idempotencyKey: createAttempt.current.key,
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
    } finally { savingLock.current = false; }
  }

  function startOver() {
    setRows([]);
    setResult(null);
    setFileName("");
    setSupplier("");
    setGstDetected(null);
    setNotes([]);
    setExtraction(null);
    setSrcDiscount(null);
    setSrcFreight(null);
    setSrcAdjustments(null);
    readPagesRef.current = [];
    setScanViewList([]);
    clearPhotos();
    setPhase("idle");
  }

  // ── Done state ──────────────────────────────────────────────────────
  if (phase === "done" && result) {
    return (
      <QuoteImportDone
        outcome={result.outcome}
        merged={result.merged}
        onScanAnother={startOver}
        onBack={() => {
          setResult(null);
          setPhase("review");
        }}
      />
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
      {/* Photos or PDFs — no `capture`, so a phone offers the photo
          library and (for the PDF) the Files app instead of the camera. */}
      <input
        ref={libraryRef}
        type="file"
        accept={SCAN_DOC_ACCEPT}
        multiple
        className="sr-only"
        onChange={onFileChosen}
        data-testid="quote-import-file-library"
      />

      {/* Upload + scan */}
      {(phase === "idle" || phase === "extracting" || phase === "error") && (
        <div className="t2q-card-pro p-5 sm:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
            {"// step 1 — photos or pdf"}
          </div>
          <p className="mt-2 text-sm text-ink-300">
            Take a photo now, or pick photos or a PDF already on your phone. Add every page
            of a long quote — up to {MAX_SCAN_PHOTOS} photos or PDFs are read together.
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
              {previews.length > 0 ? "Add photos or a PDF" : "Choose photos or a PDF"}
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
                  {previews.length === 1 ? "1 file ready" : `${previews.length} files ready`}
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
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Photos and PDFs to scan">
                {previews.map((url, i) => (
                  <li key={url || `pdf-${i}`} className="relative">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={`Photo ${i + 1} of ${previews.length}`}
                        className="h-20 w-20 rounded-md border border-[#E0DFD7] object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-ink-700 bg-ink-950 px-1 text-center text-ink-200"
                        title={pickedNames[i]}
                      >
                        <FilePdf size={26} weight="duotone" aria-hidden="true" />
                        <span className="w-full truncate text-[10px]">{pickedNames[i] ?? "PDF"}</span>
                      </span>
                    )}
                    <span className="absolute bottom-1 left-1 rounded-sm bg-black/70 px-1 font-mono text-[10px] text-white">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${url ? "photo" : "PDF"} ${i + 1}`}
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
                  ? `Reading ${scanProgress.index} of ${scanProgress.total}…`
                  : "Reading quote…"
                : previews.length > 1
                  ? `Scan ${previews.length} files`
                  : "Scan quote"}
            </button>
          </div>
          {phase === "extracting" && <div className="mt-3 flex flex-wrap items-center gap-3"><p role="status">{uploadPercent<100?`Uploading: ${uploadPercent}%`:"Uploaded. Reading line items…"}</p><button className="min-h-11 px-4" onClick={()=>scanAbort.current?.abort()}>Cancel scan</button></div>}
          {phase === "extracting" && (
            <div className="mt-4 flex justify-center">
              <TapeMeasureProgress
                estimateMs={18000 * Math.max(1, previews.length)}
                label={scanProgress && scanProgress.total > 1 ? `// ${scanProgress.index} of ${scanProgress.total}` : "// reading quote"}
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
              {scanViews.length > 0 && (
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
            {failedPages.length > 0 && (
              <div
                data-testid="quote-import-failed-pages"
                className="mt-2 rounded-sm border border-red-500/40 bg-red-500/5 p-3"
              >
                <p className="text-xs font-semibold text-red-200">
                  {failedPages.length === 1 ? "One page couldn’t be read" : `${failedPages.length} pages couldn’t be read`} — the lines below are from the pages that worked.
                </p>
                <ul className="mt-2 space-y-2">
                  {failedPages.map((f) => (
                    <li key={f.source} className="flex flex-wrap items-center gap-2 text-xs text-ink-200">
                      <span className="min-w-0 flex-1">
                        Number {f.source + 1} ({f.name}): {f.error}
                      </span>
                      <button
                        type="button"
                        onClick={() => retryPage(f.source)}
                        disabled={retrying !== null || phase !== "review"}
                        data-testid={`quote-import-retry-${f.source}`}
                        className="t2q-btn-ghost-pro inline-flex h-11 px-4 disabled:opacity-50"
                      >
                        <ArrowsClockwise size={16} weight="bold" />
                        {retrying === f.source ? "Reading…" : `Try number ${f.source + 1} again`}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                  onChange={(e) => {setGstInclusive(e.target.checked);setAcknowledged(false);}}
                  className="h-4 w-4 accent-brand"
                  data-testid="quote-import-gst"
                />
                <span className="text-sm text-ink-200">Prices include {taxLabel}</span>
              </label>
            </div>
            <ScanGstNote detected={gstDetected} inclusive={gstInclusive} taxLabel={taxLabel} />
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

          <ReviewToolbar view={review}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="min-h-11 rounded border border-ink-600 px-3" disabled={phase !== "review" || !review.rows.length} onClick={() => setBulk({ids: review.rows.map(r => r.id), include: true})}>Include displayed lines</button>
              <button type="button" className="min-h-11 rounded border border-ink-600 px-3" disabled={phase !== "review" || !review.rows.length} onClick={() => setBulk({ids: review.rows.map(r => r.id), include: false})}>Exclude displayed lines</button>
              <button type="button" className="min-h-11 rounded border border-ink-600 px-3" disabled={phase !== "review" || !history.length} onClick={undoRows}>Undo last edit</button>
            </div>
            {bulk && <div role="group" aria-label="Confirm bulk change" className="mt-3 rounded bg-ink-800 p-3"><p>{bulk.include ? "Include" : "Exclude"} {bulk.ids.length} displayed lines? Hidden lines stay as they are.</p><div className="flex gap-3"><button type="button" className="min-h-11 px-3 text-brand" disabled={phase !== "review"} onClick={applyBulk}>Confirm change</button><button type="button" className="min-h-11 px-3" onClick={() => setBulk(null)}>Cancel</button></div></div>}
          </ReviewToolbar>
          <fieldset disabled={phase !== "review"}>
          <ul className="space-y-2" data-testid="quote-import-rows">
            {review.rows.map(({value: r}) => {
              const badPrice = !validRowPrice(r);
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
                        aria-label="Material name"
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
                            step="any"
                            min={r.credit ? undefined : "0"}
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
                          {r.credit
                            ? "Add the discount amount, or untick this line."
                            : "Add a price above zero, or untick this line."}
                        </p>
                      )}
                      {r.credit && (
                        <p className="mt-1 text-[11px] text-ink-400" data-testid="quote-import-credit">
                          Discount line — it goes on the quote, not into your price library.
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
          </fieldset>

          {(srcSubtotal != null || srcGst != null || srcTotal != null || srcFreight != null || srcDiscount != null || srcAdjustments != null) && (
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
              {(srcFreight != null || srcDiscount != null || srcAdjustments != null) && (
                <p className="mt-2 text-xs text-ink-300" data-testid="quote-import-adjustments">
                  In the supplier&rsquo;s totals:{" "}
                  {[
                    srcDiscount != null ? `account discount −${formatCurrency(srcDiscount, currency)}` : null,
                    srcFreight != null ? `freight ${formatCurrency(srcFreight, currency)}` : null,
                    srcAdjustments != null ? `other adjustment ${formatCurrency(srcAdjustments, currency)}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  . They&rsquo;re counted in the total check and go on the quote as their own lines.
                </p>
              )}
            </div>
          )}

          {libraryMerges.length > 0 && (
            <p
              className="rounded-sm border border-hivis/40 bg-hivis/5 p-3 text-xs text-ink-200"
              data-testid="quote-import-library-merges"
            >
              On more than one line:{" "}
              {libraryMerges.map((m) => `“${m.name}” (${m.count} lines)`).join(", ")}. Your library keeps one
              price for each — the clearest read. Rename a line if they&rsquo;re different products.
            </p>
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
                  value&rdquo; — then create the quote or add the prices.
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
                I&rsquo;ve checked these — go ahead anyway
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
                includable.length === 0 ||
                blocked
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
      {zoomOpen && scanViews.length > 0 && (
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
            src={scanViews[Math.min(zoomIndex, scanViews.length - 1)]}
            alt={`Scanned supplier quote, photo ${Math.min(zoomIndex, scanViews.length - 1) + 1} of ${scanViews.length}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          {scanViews.length > 1 && (
            <div
              className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-3 py-1.5 text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => setZoomIndex((i) => (i - 1 + scanViews.length) % scanViews.length)}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
              >
                ‹
              </button>
              <span className="font-mono text-xs">
                {Math.min(zoomIndex, scanViews.length - 1) + 1} / {scanViews.length}
              </span>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => setZoomIndex((i) => (i + 1) % scanViews.length)}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
      <AiConsentModal open={consentOpen} onGranted={onConsentGranted} />
    </section>
  );
}
