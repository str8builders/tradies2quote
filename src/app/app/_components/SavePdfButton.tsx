"use client";

import { useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  DownloadSimple,
} from "@phosphor-icons/react";
import { isNativeIOSApp } from "@/lib/native-app";

type Props = {
  /** A route that returns an `application/pdf` body (e.g. the owner PDF routes). */
  url: string;
  /** Fallback filename if the route doesn't send a Content-Disposition name. */
  filename: string;
  label?: string;
  /** Override the default ghost-chip styling. */
  className?: string;
};

/**
 * Save / back up a PDF to the device.
 *
 * Fetches the PDF as a Blob (the owner PDF routes regenerate on demand),
 * then prefers the native share sheet — on iOS/Android that surfaces
 * "Save to Files", Drive, AirDrop, etc. Browsers that can't share files
 * fall back to a plain download. The saved filename comes from the
 * route's Content-Disposition header when present (so it reads e.g.
 * "INV-1042.pdf"), otherwise the `filename` prop.
 */
export function SavePdfButton({ url, filename, label = "Save PDF", className }: Props) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );

  async function onSave() {
    if (state === "working") return;
    setState("working");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF request failed: ${res.status}`);
      const blob = await res.blob();

      // Prefer the filename the route advertises (quote / invoice number).
      const cd = res.headers.get("content-disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(cd);
      const finalName = match?.[1] ?? filename;

      const file = new File([blob], finalName, { type: "application/pdf" });

      // iOS App Store shell: `navigator.share({files})` and `a[download]`
      // are BOTH no-ops inside WKWebView, so bridge to the real native
      // share sheet via Capacitor (write to cache, hand the file URI to
      // Share). Dynamic import — the plugin chunk never loads on the web.
      if (isNativeIOSApp()) {
        const [{ Filesystem, Directory }, { Share }] = await Promise.all([
          import("@capacitor/filesystem"),
          import("@capacitor/share"),
        ]);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () =>
            resolve(String(reader.result).split(",", 2)[1] ?? "");
          reader.readAsDataURL(blob);
        });
        const written = await Filesystem.writeFile({
          path: finalName,
          data: base64,
          directory: Directory.Cache,
        });
        try {
          await Share.share({ title: finalName, url: written.uri });
          setState("done");
        } catch {
          // Sheet dismissed — not an error.
          setState("idle");
        }
        return;
      }

      // Native share sheet first — "Save to Files" lives here on mobile.
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: finalName });
          setState("done");
          return;
        } catch (err) {
          // User dismissed the share sheet — a no-op, not an error.
          if (err instanceof DOMException && err.name === "AbortError") {
            setState("idle");
            return;
          }
          // Any other share failure → fall through to a plain download.
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setState("done");
    } catch (e) {
      console.error("SavePdfButton failed", e);
      setState("error");
    }
  }

  const text =
    state === "working"
      ? "Preparing…"
      : state === "done"
        ? "Saved"
        : state === "error"
          ? "Try again"
          : label;

  return (
    <button
      type="button"
      onClick={onSave}
      disabled={state === "working"}
      data-testid="save-pdf-button"
      className={
        className ??
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-sm border border-ink-700 bg-ink-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-200 hover:border-brand hover:text-brand disabled:opacity-60"
      }
    >
      {state === "working" ? (
        <CircleNotch size={12} weight="bold" className="animate-spin" />
      ) : state === "done" ? (
        <CheckCircle size={12} weight="bold" />
      ) : (
        <DownloadSimple size={12} weight="bold" />
      )}
      {text}
    </button>
  );
}
