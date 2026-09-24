"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Warning,
  Spinner,
  Image as ImageIcon,
  CheckCircle,
} from "@phosphor-icons/react";
import { CopyButton } from "./CopyButton";
import { prepareScanImage } from "@/lib/scanImage";
import {
  MAX_SCAN_UPLOAD_BYTES,
  SCAN_IMAGE_ACCEPT,
  detectImageMime,
  isPreparedScanMime,
  isSupportedScanInput,
  scanUploadSizeError,
} from "@/lib/imageUpload";
import type { PhotoPlanResult } from "@/lib/agents/photo-plan";
import {
  photoPlanErrorMessage,
  photoPlanNetworkErrorMessage,
} from "@/lib/agents/photoPlanErrors";

/**
 * Photo / Plan Reading Agent — upload an image, get a description +
 * likely items list with explicit uncertainty.
 *
 * Real backend: POSTs multipart to `/api/agents/photo-plan` which
 * forwards the image bytes to OpenAI Vision (gpt-4o-mini). Never
 * claims measurements unless the image has a visible scale.
 */
export function PhotoPlanAgent() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PhotoPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  function onPickFile(f: File | null) {
    setError(null);
    setResult(null);
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    const sourceSizeError = scanUploadSizeError(f);
    if (sourceSizeError) {
      setError(sourceSizeError);
      setFile(null);
      setPreview(null);
      return;
    }
    if (!isSupportedScanInput(f)) {
      setError(
        "Unsupported image type. Use JPEG, PNG, WebP, GIF or iPhone HEIC.",
      );
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      let upload = file;
      try {
        upload = await prepareScanImage(file);
      } catch {
        setError(
          'Couldn’t read that photo. Upload a JPEG, or switch your iPhone Camera to "Most Compatible".',
        );
        return;
      }
      if (upload.size > MAX_SCAN_UPLOAD_BYTES) {
        setError(
          `Image is ${(upload.size / 1024 / 1024).toFixed(1)} MB after compression. Try cropping or taking a closer photo.`,
        );
        return;
      }
      if (!isPreparedScanMime(detectImageMime(upload))) {
        setError(
          "Unsupported image type after preparation. Use JPEG, PNG, WebP or GIF.",
        );
        return;
      }
      if (upload !== file) {
        setFile(upload);
        setPreview(URL.createObjectURL(upload));
      }
      const form = new FormData();
      form.set("image", upload);
      if (hint.trim().length > 0) form.set("hint", hint.trim());
      const res = await fetch("/api/agents/photo-plan", {
        method: "POST",
        body: form,
      });
      // A proxy error page isn't JSON — never let a parse error reach the screen.
      const json = (await res.json().catch(() => null)) as
        | { ok: true; result: PhotoPlanResult }
        | { error?: string; message?: string }
        | null;
      if (res.ok && json && "ok" in json && json.ok) {
        setResult(json.result);
      } else {
        // Plain sentence, never a raw code like "trial_expired".
        setError(photoPlanErrorMessage(res.status, json));
      }
    } catch (err) {
      setError(photoPlanNetworkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      data-testid="photo-plan-agent"
      className="t2q-card-pro p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand">
          <Camera size={20} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
            Photo / Plan Reading Agent
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            Upload a phone photo or a sketched plan. We&apos;ll describe what we see
            and flag likely materials. We never quote a measurement unless the
            image has a visible scale.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
            Image
          </span>
          <div className="mt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={SCAN_IMAGE_ACCEPT}
              data-testid="photo-plan-input"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-300 file:mr-3 file:rounded-sm file:border-0 file:bg-ink-700 file:px-3 file:py-2 file:text-xs file:font-display file:uppercase file:tracking-tight file:text-ink-100 hover:file:bg-ink-600"
            />
          </div>
        </label>

        {previewUrl && (
          <div
            data-testid="photo-plan-preview"
            className="rounded-sm border border-ink-600 bg-ink-900/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
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
              className="max-h-72 w-auto rounded-sm border border-ink-700"
            />
          </div>
        )}

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
            Optional note (what you&apos;re looking at)
          </span>
          <textarea
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. 'bathroom wall I'm about to re-line — possible water damage behind the GIB'"
            className="mt-2 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:border-brand focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
            jpeg · png · webp · gif · heic · compressed before upload
          </span>
          <button
            type="submit"
            disabled={!file || submitting}
            data-testid="photo-plan-submit"
            className="inline-flex h-10 items-center gap-2 rounded-sm bg-brand px-4 font-display text-sm uppercase tracking-tight text-ink-900 transition-colors hover:bg-hivis disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
          >
            {submitting ? (
              <>
                <Spinner size={14} weight="bold" className="animate-spin" />
                Reading…
              </>
            ) : (
              <>
                <ImageIcon size={14} weight="bold" />
                Read image
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          data-testid="photo-plan-error"
          className="mt-5 rounded-sm border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200"
        >
          <Warning size={14} weight="bold" className="mr-1 inline-block" />
          {error}
        </div>
      )}

      {result && (
        <div data-testid="photo-plan-result" className="mt-5 space-y-4">
          <div className="rounded-sm border border-ink-600 bg-ink-900/60 p-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
              What we see
            </div>
            <p className="text-sm leading-relaxed text-ink-100">{result.description}</p>
          </div>

          {result.items.length > 0 && (
            <div className="rounded-sm border border-ink-600 bg-ink-900/60 p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                <CheckCircle size={12} weight="bold" className="text-brand" />
                Likely items
              </div>
              <ul className="space-y-2">
                {result.items.map((it, i) => (
                  <li
                    key={i}
                    className="rounded-sm border border-ink-700 bg-ink-900/30 p-2 text-sm text-ink-100"
                  >
                    <span className="font-semibold text-white">{it.label}</span>
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
                      · {Math.round(it.confidence * 100)}% conf{it.ai_estimated ? " · T2Q guess" : ""}
                    </span>
                    {(it.location || it.note) && (
                      <div className="mt-1 text-xs text-ink-300">
                        {it.location && <span>{it.location}</span>}
                        {it.location && it.note && <span> · </span>}
                        {it.note && <span>{it.note}</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.reviewFlags.length > 0 && (
            <div className="rounded-sm border border-hivis/40 bg-hivis/5 p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
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

          <div className="rounded-sm border border-ink-600 bg-ink-900/60 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                Quote note draft
              </span>
              <CopyButton
                text={result.quoteNote}
                testId="photo-plan-copy"
                label="Copy as quote note"
              />
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink-100">
              {result.quoteNote}
            </pre>
          </div>

          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-500">
            {"// no measurements claimed without a visible scale · always re-measure on site"}
          </p>
        </div>
      )}
    </section>
  );
}
