"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_TEXT_FILE_BYTES,
  MAX_XLSX_FILE_BYTES,
  analysePriceTable,
  columnChoices,
  decodeTextBytes,
  parseDelimitedText,
  priceListFileKind,
  priceListFromScan,
  type ColumnKey,
  type ColumnMapping,
  type PriceListParse,
  type TableRow,
} from "@/lib/materials/priceList";
import { XlsxReadError, canReadXlsx, readXlsxRows } from "@/lib/materials/xlsx";
import { mergeExtractions, type ScanPage } from "@/lib/materials/mergeExtractions";
import { answerPage, readPagesInTurn } from "@/lib/materials/scanPages";
import { uploadSupplierDocument } from "@/lib/materials/scan-upload";
import { priceListSummary, type PriceListSummary } from "@/lib/materials/libraryImport";
import { prepareScanImage } from "@/lib/scanImage";
import {
  MAX_SCAN_UPLOAD_BYTES,
  isPdfFile,
  isSupportedScanInput,
  pdfUploadSizeError,
  scanUploadSizeError,
} from "@/lib/imageUpload";
import type { SupplierPresetId } from "@/lib/supplier-presets";
import { importMaterials } from "../../actions";

/**
 * The price-list import, shared by the old and new look: any file in
 * (CSV / TXT, Excel .xlsx, a PDF, or photos of a printed list), the same
 * review out, then the save and an honest summary. Spreadsheets are read in
 * the browser; PDFs and photos go to the AI reader in price-list mode, with
 * the iPhone app's consent step first.
 */

/** Photos of a printed price list read in one go. */
export const MAX_PRICE_LIST_PHOTOS = 6;

export type ImportPhase = "pick" | "reading" | "review" | "saving" | "done";

type TableSource = { kind: "table"; fileName: string; rows: TableRow[] };
type DocumentSource = {
  kind: "document";
  files: File[];
  pages: Array<{ index: number; page: ScanPage }>;
  failed: Array<{ index: number; name: string; error: string }>;
};

export type PriceListSource = TableSource | DocumentSource;

export function usePriceListImport({ needsAiConsent }: { needsAiConsent: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<ImportPhase>("pick");
  const [error, setError] = useState("");
  const [source, setSource] = useState<PriceListSource | null>(null);
  const [presetId, setPresetId] = useState<SupplierPresetId>("generic");
  const [userMapping, setUserMapping] = useState<ColumnMapping | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [supplierName, setSupplierName] = useState("");
  const [gstChoice, setGstChoice] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number; percent: number } | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [summary, setSummary] = useState<PriceListSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // App Store 5.1.2(i): consent before the first AI read, in the iPhone app.
  const consentNeededRef = useRef(needsAiConsent);
  const consentResolve = useRef<((granted: boolean) => void) | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const askConsent = () =>
    new Promise<boolean>((resolve) => {
      consentResolve.current = resolve;
      setConsentOpen(true);
    });
  const onConsentGranted = () => {
    consentNeededRef.current = false;
    setConsentOpen(false);
    consentResolve.current?.(true);
    consentResolve.current = null;
  };

  const parse: PriceListParse | null = useMemo(() => {
    if (!source) return null;
    const defaultSupplier = supplierName.trim() || undefined;
    if (source.kind === "table") {
      return analysePriceTable(source.rows, {
        presetId,
        mapping: userMapping ?? undefined,
        hasHeader,
        defaultSupplier,
      });
    }
    if (source.pages.length === 0) return null;
    const merged = mergeExtractions(
      source.pages.map((p) => p.page),
      source.pages.map((p) => p.index + 1),
    );
    return priceListFromScan(merged, { defaultSupplier });
  }, [source, presetId, userMapping, hasHeader, supplierName]);

  const choices = useMemo(
    () => (source?.kind === "table" && parse ? columnChoices(source.rows, parse.headerIndex) : []),
    [source, parse],
  );

  /** Ticked when the tradie says so, else when the file says its prices include GST. */
  const pricesIncludeGst = gstChoice ?? parse?.gst.inclusive === true;

  function startFresh(next: PriceListSource) {
    setSource(next);
    setUserMapping(null);
    setHasHeader(true);
    setGstChoice(null);
    setSummary(null);
    setPhase("review");
  }

  function setColumn(key: ColumnKey, index: number | null) {
    if (!parse) return;
    setUserMapping({ ...(userMapping ?? parse.mapping), [key]: index });
  }

  async function readTable(file: File, kind: "text" | "xlsx") {
    const limit = kind === "text" ? MAX_TEXT_FILE_BYTES : MAX_XLSX_FILE_BYTES;
    if (file.size > limit) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Price lists up to ${limit / 1024 / 1024} MB can be read here.`);
      return;
    }
    if (kind === "xlsx" && !canReadXlsx()) {
      setError(new XlsxReadError("unsupported_browser").message);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rows = kind === "text" ? parseDelimitedText(decodeTextBytes(bytes)) : await readXlsxRows(bytes);
      if (!rows.some((r) => r.cells.some((c) => c.trim()))) {
        setError("That file is empty.");
        return;
      }
      startFresh({ kind: "table", fileName: file.name, rows });
    } catch (e) {
      setError(e instanceof XlsxReadError ? e.message : "We couldn't read that file. Save it as CSV and try again.");
    }
  }

  /** Read photos or a PDF with the AI (price-list mode); keep what worked. */
  async function readDocuments(files: File[], only?: number[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    const indexes = only ?? files.map((_, i) => i);
    const failed: DocumentSource["failed"] = [];
    const pages: DocumentSource["pages"] = [];
    try {
      const ready: Array<{ index: number; file: File }> = [];
      for (const index of indexes) {
        const raw = files[index];
        if (isPdfFile(raw)) {
          ready.push({ index, file: raw });
          continue;
        }
        try {
          const prepared = await prepareScanImage(raw);
          if (prepared.size > MAX_SCAN_UPLOAD_BYTES) {
            failed.push({ index, name: raw.name, error: "The photo is too big even after shrinking it. Crop it or take it closer." });
          } else {
            ready.push({ index, file: prepared });
          }
        } catch {
          failed.push({ index, name: raw.name, error: "That photo couldn't be opened. Try a JPEG, or set the iPhone camera to Most Compatible." });
        }
      }
      const run = await readPagesInTurn<ScanPage>({
        indexes: ready.map((_, k) => k),
        consentNeeded: consentNeededRef.current,
        askConsent,
        onPage: (_k, position) => setProgress({ index: position + 1, total: ready.length, percent: 0 }),
        read: (k) =>
          answerPage<ScanPage>(() =>
            uploadSupplierDocument(ready[k].file, {
              signal: controller.signal,
              onProgress: (percent) => setProgress((p) => (p ? { ...p, percent } : p)),
              mode: "price_list",
            }),
          ),
      });
      if (run.declined) return { declined: true as const, pages, failed };
      for (const o of run.outcomes) {
        const { index } = ready[o.index];
        if (o.ok) pages.push({ index, page: o.page });
        else failed.push({ index, name: files[index].name, error: o.error });
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const message = aborted ? "Stopped." : e instanceof Error ? e.message : "Network error. Please try again.";
      for (const index of indexes) {
        if (!pages.some((p) => p.index === index) && !failed.some((f) => f.index === index)) {
          failed.push({ index, name: files[index].name, error: message });
        }
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
    return { declined: false as const, pages, failed };
  }

  async function readFiles(list: File[]) {
    setError("");
    if (list.length === 0) return;
    const kinds = list.map(priceListFileKind);
    if (list.length > 1 && !kinds.every((k) => k === "image")) {
      setError("Choose one spreadsheet or PDF, or up to 6 photos of a printed price list.");
      return;
    }
    if (list.length > MAX_PRICE_LIST_PHOTOS) {
      setError(`Choose up to ${MAX_PRICE_LIST_PHOTOS} photos at a time.`);
      return;
    }
    const kind = kinds[0];
    if (kind === "old-excel") {
      setError("That's an older Excel file. Open it in Excel, save it as .xlsx or CSV, then choose it again.");
      return;
    }
    if (kind === "unsupported") {
      setError("That kind of file can't be read. Choose a CSV, an Excel (.xlsx) file, a PDF, or photos of the price list.");
      return;
    }
    if (kind === "text" || kind === "xlsx") {
      await readTable(list[0], kind);
      return;
    }
    for (const f of list) {
      const problem = isPdfFile(f) ? pdfUploadSizeError(f) : scanUploadSizeError(f) ?? (isSupportedScanInput(f) ? null : "That photo type can't be read. Use JPEG, PNG or iPhone HEIC.");
      if (problem) {
        setError(`${f.name}: ${problem}`);
        return;
      }
    }
    setPhase("reading");
    setProgress({ index: 1, total: list.length, percent: 0 });
    const read = await readDocuments(list);
    if (read.declined) {
      setPhase("pick");
      return;
    }
    if (read.pages.length === 0) {
      const one = list.length === 1;
      setError(
        read.failed
          .sort((a, b) => a.index - b.index)
          .map((f) => (one ? f.error : `${f.name}: ${f.error}`))
          .join(" ") || "Nothing could be read from that.",
      );
      setPhase("pick");
      return;
    }
    startFresh({ kind: "document", files: list, pages: read.pages, failed: read.failed });
  }

  /** Try one photo (or the PDF) that failed again. */
  async function retryFailed(index: number) {
    if (source?.kind !== "document" || retrying !== null) return;
    setRetrying(index);
    const read = await readDocuments(source.files, [index]);
    setRetrying(null);
    if (read.declined) return;
    setSource((current) => {
      if (current?.kind !== "document") return current;
      return {
        ...current,
        pages: [...current.pages, ...read.pages].sort((a, b) => a.index - b.index),
        failed: [...current.failed.filter((f) => f.index !== index), ...read.failed],
      };
    });
  }

  function cancelReading() {
    abortRef.current?.abort();
  }

  async function save() {
    if (!parse || parse.valid.length === 0 || parse.tooMany) return;
    setError("");
    setPhase("saving");
    try {
      const result = await importMaterials(
        parse.valid.map((r) => ({
          name: r.name,
          unit: r.unit,
          default_unit_price: r.default_unit_price,
          sku: r.sku,
          supplier: r.supplier,
          supplier_url: r.supplier_url,
          notes: r.notes,
        })),
        { pricesIncludeGst, source: parse.source === "document" ? "scan" : "file" },
      );
      if (result.error && result.inserted + result.updated + result.unchanged === 0 && result.problems.length === 0) {
        setError(result.error);
        setPhase("review");
        return;
      }
      setSummary(priceListSummary(result, parse));
      setPhase("done");
      router.refresh();
    } catch {
      // A dropped connection or a server hiccup stays on this screen (never
      // the error page), with the review intact so the tradie can try again.
      setError("Couldn't save your prices — check your connection and try again. Nothing was lost.");
      setPhase("review");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setSource(null);
    setUserMapping(null);
    setHasHeader(true);
    setGstChoice(null);
    setSupplierName("");
    setSummary(null);
    setError("");
    setPhase("pick");
  }

  return {
    phase,
    error,
    source,
    parse,
    choices,
    progress,
    retrying,
    summary,
    presetId,
    setPresetId,
    hasHeader,
    setHasHeader,
    setColumn,
    supplierName,
    setSupplierName,
    pricesIncludeGst,
    setPricesIncludeGst: (value: boolean) => setGstChoice(value),
    readFiles,
    retryFailed,
    cancelReading,
    save,
    reset,
    consent: { open: consentOpen, onGranted: onConsentGranted },
  };
}

export type PriceListImport = ReturnType<typeof usePriceListImport>;
