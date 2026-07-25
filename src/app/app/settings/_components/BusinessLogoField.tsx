"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Trash, UploadSimple } from "@phosphor-icons/react";
import {
  removeBusinessLogoAction,
  uploadBusinessLogoAction,
  type LogoActionResult,
} from "../logo-actions";
import { prepareLogoImage } from "@/lib/imagePrep";

/**
 * Business logo upload for Settings.
 *
 * Wired to the `business-logos` bucket + `profiles.logo_url`. The stored logo
 * renders top-left of every quote and invoice PDF the tradie sends to clients
 * (see `src/lib/pdf-logo.ts`). Validation runs client-side (instant) and in the
 * server action (authoritative + RLS-gated); the client also compresses the
 * pick (HEIC→JPEG, downscale) so a raw phone photo never bounces on size.
 */

// Broad picker accept so the iOS Photos picker lets a HEIC through — we convert
// it client-side. The server action still enforces PNG/JPG on what it receives.
const CLIENT_ACCEPT =
  "image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,.heic,.heif";
const LIKELY_IMAGE_RE = /\.(png|jpe?g|webp|hei[cf])$/i;

function isLikelyImage(file: File): boolean {
  if (/^image\//i.test(file.type)) return true;
  if (!file.type) return LIKELY_IMAGE_RE.test(file.name);
  return false;
}

export function BusinessLogoField({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleResult = (res: LogoActionResult) => {
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    router.refresh();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    // Clear so re-picking the same file re-fires onChange.
    if (e.target) e.target.value = "";
    if (!file) return;
    if (!isLikelyImage(file)) {
      setError("Use a PNG or JPG logo.");
      return;
    }
    startTransition(async () => {
      let prepared = file;
      try {
        prepared = await prepareLogoImage(file);
      } catch {
        // Fall back to the original; the server action re-validates format/size.
      }
      const fd = new FormData();
      fd.append("logo", prepared);
      try {
        const res = await uploadBusinessLogoAction(fd);
        handleResult(res);
      } catch {
        // A thrown action (network drop, or a platform 413 on a pathological
        // file) would otherwise be a silent unhandled rejection.
        setError("Upload failed — try a smaller image or check your connection.");
      }
    });
  };

  const onRemove = () => {
    setError(null);
    startTransition(async () => {
      const res = await removeBusinessLogoAction();
      handleResult(res);
    });
  };

  return (
    <section
      data-testid="settings-logo-field"
      className="t2q-card-pro p-5 sm:p-7"
    >
      <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
        Business logo
      </h2>
      <p className="mt-2 text-sm text-ink-300">
        Appears on every quote and invoice PDF you send to clients.
      </p>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Preview — light plate because logos are made for white paper. */}
        <div
          data-testid="settings-logo-preview"
          className="flex h-24 w-full max-w-[240px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-ink-600 bg-white p-3"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Your business logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="flex flex-col items-center gap-1 text-ink-400">
              <ImageIcon size={26} weight="regular" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.2em]">
                No logo yet
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            <label
              aria-disabled={pending}
              data-testid="settings-logo-upload"
              className={`relative inline-flex items-center gap-2 overflow-hidden rounded-sm border border-ink-600 bg-ink-900 px-4 py-2.5 text-xs font-display uppercase tracking-tight text-white hover:border-brand hover:text-brand ${
                pending ? "pointer-events-none opacity-60" : "cursor-pointer"
              }`}
            >
              <UploadSimple size={14} weight="bold" aria-hidden="true" />
              <span>{pending ? "Saving…" : logoUrl ? "Change" : "Upload logo"}</span>
              <input
                type="file"
                accept={CLIENT_ACCEPT}
                onChange={onPick}
                disabled={pending}
                data-testid="settings-logo-input"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {logoUrl ? (
              <button
                type="button"
                onClick={onRemove}
                disabled={pending}
                data-testid="settings-logo-remove"
                className="inline-flex items-center gap-1.5 rounded-sm border border-ink-600 bg-ink-900 px-3 py-2.5 text-xs font-display uppercase tracking-tight text-ink-300 hover:border-red-500/60 hover:text-red-200 disabled:opacity-60"
              >
                <Trash size={13} weight="bold" aria-hidden="true" />
                Remove
              </button>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              data-testid="settings-logo-error"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-300"
            >
              {error}
            </p>
          ) : (
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
              {"// png or jpg · a transparent png sits best on the pdf"}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
