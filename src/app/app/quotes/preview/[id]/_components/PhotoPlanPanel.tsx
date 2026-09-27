"use client";

import { fetchWithTimeout } from "@/lib/fetchTimeout";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CaretDown,
  CheckCircle,
  Spinner,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { prepareScanImage } from "@/lib/scanImage";
import {
  MAX_SCAN_UPLOAD_BYTES,
  SCAN_IMAGE_ACCEPT,
  detectImageMime,
  isPreparedScanMime,
  isSupportedScanInput,
  scanUploadSizeError,
} from "@/lib/imageUpload";
import type { PhotoPlanItem, PhotoPlanResult } from "@/lib/agents/photo-plan";
import {
  photoPlanErrorMessage,
  photoPlanNetworkErrorMessage,
} from "@/lib/agents/photoPlanErrors";
import { readPagesInTurn, type PageAnswer } from "@/lib/materials/scanPages";

/** The consent step before a photo goes to the AI (App Store 5.1.2(i)). */
export interface PhotoPlanConsent {
  /** True in the iPhone app until consent is on record (the page decides). */
  needed: boolean;
  /** Show the consent step; resolves true once the tradie agrees. */
  ask: () => Promise<boolean>;
}

/** One upload to the reader: its answer, or why not in plain words. */
export async function sendPhotoPlan(
  image: File,
  hint: string,
): Promise<PageAnswer<PhotoPlanResult>> {
  const form = new FormData();
  form.set("image", image);
  if (hint.trim().length > 0) form.set("hint", hint.trim());
  const res = await fetchWithTimeout("/api/agents/photo-plan", {
    method: "POST",
    body: form,
    // Vision LLM call — same stall guard as the core generate flow.
    signal: AbortSignal.timeout(90_000),
  });
  // A proxy error page isn't JSON — never let a parse error reach the screen.
  const json = (await res.json().catch(() => null)) as
    | { ok: true; result: PhotoPlanResult }
    | { error?: string; message?: string }
    | null;
  if (res.ok && json && "ok" in json && json.ok) {
    return { ok: true, page: json.result };
  }
  const code =
    json && "error" in json && typeof json.error === "string"
      ? json.error
      : undefined;
  // Plain sentence, never a raw code like "trial_expired".
  return {
    ok: false,
    status: res.status,
    code,
    error: photoPlanErrorMessage(res.status, json),
  };
}

export type PhotoPlanOutcome =
  | { kind: "read"; result: PhotoPlanResult }
  | { kind: "failed"; error: string }
  /** The tradie didn't agree to AI: nothing was sent. */
  | { kind: "declined" };

/**
 * Prepare a photo (HEIC to JPEG, compressed) and read it. `onPrepared` hears
 * about the converted copy before it is sent. With `consent`, it asks first
 * while consent is needed, and asks again if the route turns the photo away
 * for it, then sends once more (readPagesInTurn: the supplier scanner's
 * order), so nothing reaches the AI without it. Without, the route's refusal
 * is just the error. Throws only what fetch throws (offline, timed out).
 */
export async function readPhotoPlan(
  source: File,
  hint: string,
  options: {
    consent?: PhotoPlanConsent;
    onPrepared?: (upload: File) => void;
  } = {},
): Promise<PhotoPlanOutcome> {
  let upload = source;
  try {
    upload = await prepareScanImage(source);
  } catch {
    return {
      kind: "failed",
      error:
        'Couldn’t read that photo. Upload a JPEG, or switch your iPhone Camera to "Most Compatible".',
    };
  }
  if (upload.size > MAX_SCAN_UPLOAD_BYTES) {
    return {
      kind: "failed",
      error: `Image is ${(upload.size / 1024 / 1024).toFixed(1)} MB after compression. Try cropping or taking a closer photo.`,
    };
  }
  if (!isPreparedScanMime(detectImageMime(upload))) {
    return {
      kind: "failed",
      error:
        "Unsupported image type after preparation. Use JPEG, PNG, WebP or GIF.",
    };
  }
  if (upload !== source) options.onPrepared?.(upload);
  const send = () => sendPhotoPlan(upload, hint);
  const { consent } = options;
  if (!consent) {
    const answer = await send();
    return answer.ok
      ? { kind: "read", result: answer.page }
      : { kind: "failed", error: answer.error };
  }
  const run = await readPagesInTurn({
    indexes: [0],
    consentNeeded: consent.needed,
    askConsent: consent.ask,
    read: send,
  });
  const outcome = run.outcomes[0];
  if (run.declined || !outcome) return { kind: "declined" };
  return outcome.ok
    ? { kind: "read", result: outcome.page }
    : { kind: "failed", error: outcome.error };
}

/**
 * The photo reader's state and steps: a photo picked and checked, then read
 * (readPhotoPlan), and its answer or a plain error kept. Both looks run on it
 * (<PhotoPlanPanel> below and the new job page's <AddFromPlanSheet>), so they
 * check, prepare and read a photo exactly alike. It never touches the quote:
 * each look adds the answer its own way, both through lib/photoPlanLines.
 *
 * `consent` (the new look, in the iPhone app): asked before the first read
 * while needed, and not again once agreed; the route still checks every read.
 * The classic panel passes none, so the route's refusal shows as its error.
 *
 * The classic render test seeds these states in the order they are declared
 * here, so add a new one after `error`.
 */
export function usePhotoPlan(consent?: PhotoPlanConsent) {
  const previewUrlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PhotoPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Asked once: after "I agree" later reads go straight through.
  const consentNeededRef = useRef(consent?.needed ?? false);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function setPreview(url: string | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  /** A photo picked, or cleared with null. Returns it when it's one we can read. */
  function pickFile(f: File | null): File | null {
    setError(null);
    setResult(null);
    if (!f) {
      setFile(null);
      setPreview(null);
      return null;
    }
    const sourceSizeError = scanUploadSizeError(f);
    if (sourceSizeError) {
      setError(sourceSizeError);
      setFile(null);
      setPreview(null);
      return null;
    }
    if (!isSupportedScanInput(f)) {
      setError(
        "Unsupported image type. Use JPEG, PNG, WebP, GIF or iPhone HEIC.",
      );
      setFile(null);
      setPreview(null);
      return null;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    return f;
  }

  /** Read the picked photo, or the one just picked (state isn't set yet). */
  async function read(source: File | null = file): Promise<void> {
    if (!source || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await readPhotoPlan(source, hint, {
        consent: consent && {
          needed: consentNeededRef.current,
          ask: async () => {
            const granted = await consent.ask();
            if (granted) consentNeededRef.current = false;
            return granted;
          },
        },
        onPrepared: (upload) => {
          setFile(upload);
          setPreview(URL.createObjectURL(upload));
        },
      });
      // "declined": nothing was sent, and there's nothing to say.
      if (outcome.kind === "read") setResult(outcome.result);
      else if (outcome.kind === "failed") setError(outcome.error);
    } catch (err) {
      setError(photoPlanNetworkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    file,
    hint,
    setHint,
    previewUrl,
    submitting,
    result,
    error,
    pickFile,
    read,
  };
}

/**
 * Photo / Plan panel — the quote-editor surface for the Photo/Plan
 * Reading agent.
 *
 * Mirrors <TakeoffPanel>: a collapsible `t2q-card-pro` that sits in the
 * quote editor. The tradie uploads a site photo or a sketched plan; it
 * POSTs to the existing `/api/agents/photo-plan` route (auth-gated,
 * in-memory, already reports every run to the monitoring dashboard);
 * and the result can be dropped straight into the quote being edited:
 *
 *   • "Add items"  → onAddItems(result.items)  — detected materials
 *                     become draft line items in the editor.
 *   • "Add notes"  → onAddNotes([...])          — the quote-note draft
 *                     + on-site review flags land in the quote's
 *                     "// review these" box.
 *
 * Never writes to the DB itself — the parent <QuoteEditor> owns state
 * and the tradie still clicks Save. When the quote is accepted the
 * apply buttons are disabled (edits are locked).
 */
type Props = {
  onAddItems: (items: PhotoPlanItem[]) => void;
  onAddNotes: (lines: string[]) => void;
  isAccepted?: boolean;
};

export function PhotoPlanPanel({ onAddItems, onAddNotes, isAccepted }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { file, hint, setHint, previewUrl, submitting, result, error, pickFile, read } = usePhotoPlan();
  const [itemsApplied, setItemsApplied] = useState(false);
  const [notesApplied, setNotesApplied] = useState(false);

  function onPickFile(f: File | null) {
    setItemsApplied(false);
    setNotesApplied(false);
    pickFile(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || submitting) return;
    setItemsApplied(false);
    setNotesApplied(false);
    await read(file);
  }

  function handleAddItems() {
    if (!result || result.items.length === 0 || isAccepted) return;
    onAddItems(result.items);
    setItemsApplied(true);
  }

  function handleAddNotes() {
    if (!result || isAccepted) return;
    onAddNotes([result.quoteNote, ...result.reviewFlags]);
    setNotesApplied(true);
  }

  const summaryLine = result
    ? `Read · ${result.items.length} item${
        result.items.length === 1 ? "" : "s"
      } found`
    : "Upload a site photo or a sketched plan";

  return (
    <section data-testid="photo-plan-panel" className="t2q-card-pro">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="inline-block h-6 w-1.5 shrink-0 rounded-full bg-brand"
              />
              <h3 className="font-display text-xl uppercase tracking-tight sm:text-2xl">
                Photo / <span className="text-brand">plan</span>
              </h3>
            </div>
            <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
              {summaryLine}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 group-hover:text-white">
            <span>Read a photo</span>
            <CaretDown
              size={14}
              weight="bold"
              className="transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </span>
        </summary>

        <div className="border-t border-ink-700 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <p className="text-xs text-ink-400">
            Upload a phone photo or a sketched plan. The agent describes what
            it sees and flags likely materials — it never claims a measurement
            without a visible scale. Nothing is saved until you click Save.
          </p>

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                Image
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={SCAN_IMAGE_ACCEPT}
                data-testid="photo-plan-panel-input"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-ink-300 file:mr-3 file:rounded-sm file:border-0 file:bg-ink-700 file:px-3 file:py-2 file:text-xs file:font-display file:uppercase file:tracking-tight file:text-ink-100 hover:file:bg-ink-600"
              />
            </label>

            {previewUrl && (
              <div className="rounded-sm border border-ink-700 bg-ink-900/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                    Preview · {file?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPickFile(null)}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 hover:text-ink-200"
                  >
                    Remove
                  </button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Selected upload preview"
                  className="max-h-60 w-auto rounded-sm border border-ink-700"
                />
              </div>
            )}

            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                Optional note
              </span>
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. bathroom wall I'm about to re-line — possible water damage behind the GIB"
                className="mt-1.5 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
                jpeg · png · webp · gif · heic · compressed before upload
              </span>
              <button
                type="submit"
                disabled={!file || submitting}
                data-testid="photo-plan-panel-submit"
                className="t2q-btn-primary-pro disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Spinner size={16} weight="bold" className="animate-spin" />
                    Reading…
                  </>
                ) : (
                  <>
                    <Camera size={16} weight="bold" />
                    Read image
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div
              role="alert"
              data-testid="photo-plan-panel-error"
              className="mt-4 rounded-sm border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200"
            >
              <Warning size={14} weight="bold" className="mr-1 inline-block" />
              {error}
            </div>
          )}

          {result && (
            <div
              data-testid="photo-plan-panel-result"
              className="mt-4 space-y-4"
            >
              <div className="rounded-sm border border-ink-700 bg-ink-900/60 p-3">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  What we see
                </div>
                <p className="text-sm leading-relaxed text-ink-100">
                  {result.description}
                </p>
              </div>

              {result.items.length > 0 && (
                <div className="rounded-sm border border-ink-700 bg-ink-900/60 p-3">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                    Likely items
                  </div>
                  <ul className="space-y-1.5">
                    {result.items.map((it, i) => (
                      <li key={i} className="text-sm text-ink-100">
                        <span className="font-semibold text-white">
                          {it.label}
                        </span>
                        <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
                          · {Math.round(it.confidence * 100)}% conf
                        </span>
                        {it.location && (
                          <span className="ml-1 text-xs text-ink-400">
                            · {it.location}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.reviewFlags.length > 0 && (
                <div className="rounded-sm border border-hivis/40 bg-hivis/5 p-3">
                  <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
                    <Warning size={12} weight="bold" />
                    Check on site
                  </div>
                  <ul className="space-y-1 text-sm text-ink-200">
                    {result.reviewFlags.map((f, i) => (
                      <li key={i} className="list-inside list-disc">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-sm border border-ink-700 bg-ink-900/60 p-3">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  Quote note draft
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-100">
                  {result.quoteNote}
                </p>
              </div>

              {/* Apply actions — drop the result into the quote being
                  edited. The parent owns state; the tradie still clicks
                  Save. Disabled once the quote is accepted. */}
              <div className="flex flex-col gap-2 border-t border-ink-700 pt-4 sm:flex-row sm:items-center">
                {result.items.length > 0 && (
                  <button
                    type="button"
                    data-testid="photo-plan-panel-add-items"
                    onClick={handleAddItems}
                    disabled={isAccepted || itemsApplied}
                    title={isAccepted ? "Quote already accepted." : undefined}
                    className="t2q-btn-primary-pro disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {itemsApplied ? (
                      <>
                        <CheckCircle size={16} weight="fill" />
                        {result.items.length} item
                        {result.items.length === 1 ? "" : "s"} added
                      </>
                    ) : (
                      `Add ${result.items.length} item${
                        result.items.length === 1 ? "" : "s"
                      } to materials`
                    )}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="photo-plan-panel-add-notes"
                  onClick={handleAddNotes}
                  disabled={isAccepted || notesApplied}
                  title={isAccepted ? "Quote already accepted." : undefined}
                  className="t2q-btn-ghost-pro disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {notesApplied ? (
                    <>
                      <CheckCircle size={16} weight="fill" />
                      Notes added
                    </>
                  ) : (
                    "Add notes to quote"
                  )}
                </button>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
                {"// items land with no price unless your library matches — set prices before sending"}
              </p>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
