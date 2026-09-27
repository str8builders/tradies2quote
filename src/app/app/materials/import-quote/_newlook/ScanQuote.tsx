"use client";

import { useState } from "react";
import {
  ArrowsIn,
  ArrowsOut,
  Camera,
  CaretLeft,
  CaretRight,
  CheckCircle,
  FilePdf,
  Image as ImageIcon,
  Scan,
  StopCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { AiConsentModal } from "@/app/app/quotes/new/_components/AiConsentModal";
import { SCAN_DOC_ACCEPT } from "@/lib/imageUpload";
import {
  MAX_SCAN_PHOTOS,
  useQuoteImport,
  type QuoteImport,
  type QuoteImportProps,
} from "../_components/QuoteImportClient";
import { QuoteImportDone } from "../_components/QuoteImportDone";
import { ScanError, type ScanState } from "./parts";
import { ScanQuoteReview } from "./ScanQuoteReview";

/**
 * "Scan a supplier quote" in the new look: the old look's scan
 * (useQuoteImport) drawn with the kit. Photos or PDFs in, read page by page,
 * every line checked against the supplier's totals, then a quote or the
 * prices saved.
 */
export function ScanQuote(props: QuoteImportProps) {
  // The file inputs' refs travel on their own: read off the state object in
  // render, React's compiler treats the whole object as a ref.
  const { fileRef, libraryRef, ...q } = useQuoteImport(props);
  return (
    <ScanQuoteView
      q={q}
      fileRef={fileRef}
      libraryRef={libraryRef}
      currency={props.currency}
      taxLabel={props.taxLabel ?? "GST"}
    />
  );
}

/** Any state of the scan, drawn. A plain function of the state, so each one renders in tests. */
export function ScanQuoteView({
  q,
  fileRef,
  libraryRef,
  currency,
  taxLabel,
}: {
  q: ScanState;
  fileRef: QuoteImport["fileRef"];
  libraryRef: QuoteImport["libraryRef"];
  currency: string;
  taxLabel: string;
}) {
  if (q.phase === "done" && q.result) {
    return (
      <QuoteImportDone
        look="new"
        outcome={q.result.outcome}
        merged={q.result.merged}
        onScanAnother={q.startOver}
        onBack={() => {
          q.setResult(null);
          q.setPhase("review");
        }}
      />
    );
  }
  const picking = q.phase === "idle" || q.phase === "extracting" || q.phase === "error";
  const reviewing = q.phase === "review" || q.phase === "saving" || q.phase === "creating";

  return (
    <div className="space-y-6" data-testid="scan-quote">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        className="sr-only"
        onChange={q.onFileChosen}
        data-testid="quote-import-file"
      />
      {/* No `capture`, so a phone offers the photo library and (for a PDF) the Files app. */}
      <input
        ref={libraryRef}
        type="file"
        accept={SCAN_DOC_ACCEPT}
        multiple
        className="sr-only"
        onChange={q.onFileChosen}
        data-testid="quote-import-file-library"
      />

      {picking ? <PickCard q={q} /> : null}
      {/* While reviewing, a problem shows by the buttons that caused it (ScanQuoteReview). */}
      {picking && q.error ? <ScanError error={q.error} /> : null}
      {reviewing ? <ScanQuoteReview q={q} currency={currency} taxLabel={taxLabel} /> : null}

      <ScanViewer q={q} />
      <AiConsentModal look="new" open={q.consentOpen} onGranted={q.onConsentGranted} />
    </div>
  );
}

/** Step one: every page of the quote, then Scan. The orange button is always the next step. */
function PickCard({ q }: { q: ScanState }) {
  const reading = q.phase === "extracting";
  const count = q.previews.length;
  const progress = q.scanProgress;
  return (
    <Card as="section" padding="lg" className="space-y-4" aria-labelledby="scan-quote-pick">
      <SectionTitle
        id="scan-quote-pick"
        description={`A quote or invoice from ITM, PlaceMakers, Mitre 10 or similar. Add every page of a long quote: up to ${MAX_SCAN_PHOTOS} photos or PDFs are read together.`}
      >
        Photos or a PDF of the quote
      </SectionTitle>

      {count > 0 ? <PickedFiles q={q} /> : null}

      <div className="space-y-2">
        <Button
          variant={count > 0 ? "secondary" : "primary"}
          fullWidth
          icon={<Camera weight="bold" />}
          disabled={reading}
          onClick={q.pickFile}
        >
          {count > 0 ? "Add a photo" : "Take a photo"}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          icon={<ImageIcon weight="bold" />}
          disabled={reading}
          onClick={q.pickLibrary}
          data-testid="quote-import-library-btn"
        >
          {count > 0 ? "Add photos or a PDF" : "Choose photos or a PDF"}
        </Button>
      </div>

      <Button
        fullWidth
        icon={<Scan weight="bold" />}
        loading={reading}
        loadingLabel={progress && progress.total > 1 ? `Reading ${progress.index} of ${progress.total}…` : "Reading quote…"}
        disabled={!q.fileName}
        onClick={() => void q.scan()}
        data-testid="quote-import-scan"
      >
        {count > 1 ? `Scan ${count} files` : "Scan quote"}
      </Button>

      {reading ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-ui-sm text-ui-muted">
            {q.uploadPercent < 100 ? `Uploading ${q.uploadPercent}%` : "Uploaded. Reading the lines…"}
          </p>
          <Button variant="ghost" size="sm" icon={<StopCircle weight="bold" />} onClick={() => q.scanAbort.current?.abort()}>
            Cancel scan
          </Button>
        </div>
      ) : null}

      <p className="text-ui-sm text-ui-muted">
        We read the lines and you check each one. Then make a quote with the same numbers, or add the prices to your
        list. Saved prices are marked as scanned estimates, so confirm them with the supplier.
      </p>
    </Card>
  );
}

function PickedFiles({ q }: { q: ScanState }) {
  const reading = q.phase === "extracting";
  const count = q.previews.length;
  return (
    <div data-testid="quote-import-preview" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-ui-ok">
          <CheckCircle aria-hidden="true" weight="fill" className="shrink-0 text-[1.25rem]" />
          {count === 1 ? "1 file ready" : `${count} files ready`}
        </p>
        <Button variant="ghost" size="sm" disabled={reading} onClick={q.clearPhotos} data-testid="quote-import-clear">
          Clear all
        </Button>
      </div>
      <ul
        aria-label="Photos and PDFs to scan"
        className="divide-y divide-ui-line overflow-hidden rounded-ui-md border border-ui-line"
      >
        {q.previews.map((url, i) => (
          <li key={url || `pdf-${i}`} className="flex min-h-16 items-center gap-3 py-2 pr-1 pl-2">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={`Photo ${i + 1} of ${count}`}
                className="h-14 w-14 shrink-0 rounded-ui-sm border border-ui-line object-cover"
              />
            ) : (
              <IconTile icon={<FilePdf weight="duotone" />} size="lg" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{url ? `Photo ${i + 1}` : `PDF ${i + 1}`}</span>
              <span className="block truncate text-ui-sm text-ui-muted">{q.pickedNames[i] ?? ""}</span>
            </span>
            <IconButton
              label={`Remove ${url ? "photo" : "PDF"} ${i + 1}`}
              icon={<X weight="bold" />}
              disabled={reading}
              onClick={() => q.removePhoto(i)}
            />
          </li>
        ))}
      </ul>
      <p className="truncate text-ui-sm text-ui-muted" data-testid="quote-import-filename">
        {q.fileName} · tap “Scan” to read the lines.
      </p>
    </div>
  );
}

/**
 * The photos the reader saw, to hold each flagged line up against. The app
 * locks pinch zoom (see the root viewport), so the photo zooms itself: at
 * twice the width it pans inside its box with one thumb.
 */
function ScanViewer({ q }: { q: ScanState }) {
  const [zoomed, setZoomed] = useState(false);
  const total = q.scanViews.length;
  const at = Math.min(q.zoomIndex, Math.max(total - 1, 0));
  return (
    <BottomSheet
      open={q.zoomOpen && total > 0}
      onClose={() => q.setZoomOpen(false)}
      title="Your scan"
      description={total > 1 ? `Photo ${at + 1} of ${total}` : "Hold each line up against the photo."}
      closeLabel="Close scan view"
      footer={
        total > 1 ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={<CaretLeft weight="bold" />}
              aria-label="Previous photo"
              onClick={() => q.setZoomIndex((i) => (i - 1 + total) % total)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              iconEnd={<CaretRight weight="bold" />}
              aria-label="Next photo"
              onClick={() => q.setZoomIndex((i) => (i + 1) % total)}
            >
              Next
            </Button>
          </div>
        ) : undefined
      }
    >
      {total > 0 ? (
        <div className="space-y-3" data-testid="quote-import-scan-zoom">
          <div className="max-h-[62dvh] overflow-auto overscroll-contain rounded-ui-md border border-ui-line bg-ui-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.scanViews[at]}
              alt={`Scanned supplier quote, photo ${at + 1} of ${total}`}
              className={
                zoomed ? "block w-[200%] max-w-none" : "mx-auto block max-h-[62dvh] w-auto max-w-full object-contain"
              }
            />
          </div>
          <Button
            variant="ghost"
            fullWidth
            icon={zoomed ? <ArrowsIn weight="bold" /> : <ArrowsOut weight="bold" />}
            onClick={() => setZoomed((z) => !z)}
          >
            {zoomed ? "Fit the photo" : "Zoom in"}
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}
