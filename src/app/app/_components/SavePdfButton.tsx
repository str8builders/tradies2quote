"use client";

import { useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  DownloadSimple,
} from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { isNativeIOSApp } from "@/lib/native-app";
import { BusinessSettingsLink } from "./BusinessSettingsLink";
import { BUSINESS_NAME_REQUIRED } from "@/lib/business-name";

type SaveState = "idle" | "working" | "done" | "error";

type Props = {
  /** A route that returns an `application/pdf` body (e.g. the owner PDF routes). */
  url: string;
  /** Fallback filename if the route doesn't send a Content-Disposition name. */
  filename: string;
  label?: string;
  /** Classic: override the default ghost-chip styling. New look: layout only. */
  className?: string;
  /** "new": the kit's secondary button, full width, with any problem in a callout (ui- tokens, outdoor mode). */
  look?: "classic" | "new";
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
export function SavePdfButton({ url, filename, label = "Save PDF", className, look = "classic" }: Props) {
  const [state, setState] = useState<SaveState>(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [needsBusinessName, setNeedsBusinessName] = useState(false);

  async function onSave() {
    if (state === "working") return;
    setState("working");
    setErrorMessage("");
    setNeedsBusinessName(false);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const error = await res.json().catch(() => ({})) as { error?: string; message?: string };
        setNeedsBusinessName(error.error === BUSINESS_NAME_REQUIRED.error);
        setErrorMessage(error.message ?? "Could not prepare the PDF. Please try again.");
        setState("error");
        return;
      }
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
      setErrorMessage("Could not save the PDF. Please try again.");
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

  if (look === "new") {
    return (
      <SavePdfButtonV2View
        state={state}
        text={text}
        errorMessage={errorMessage}
        needsBusinessName={needsBusinessName}
        onSave={onSave}
        className={className}
      />
    );
  }

  return (
    <>
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
    {state === "error" && <span role="alert" className="text-sm text-red-400">{errorMessage}{needsBusinessName && <BusinessSettingsLink />}</span>}
    </>
  );
}

/**
 * The new look's button for a given state (no browser work here): the kit's
 * secondary button, spinning while the PDF is made, and a problem in a
 * callout with the fix right there, as the job page's PDF screen does.
 */
export function SavePdfButtonV2View({
  state,
  text,
  errorMessage,
  needsBusinessName,
  onSave,
  className,
}: {
  state: SaveState;
  text: string;
  errorMessage: string;
  needsBusinessName: boolean;
  onSave: () => void;
  className?: string;
}) {
  return (
    <div className={cx("space-y-2", className)}>
      <Button
        variant="secondary"
        fullWidth
        loading={state === "working"}
        icon={state === "done" ? <CheckCircle weight="bold" /> : <DownloadSimple weight="bold" />}
        onClick={onSave}
        data-testid="save-pdf-button"
      >
        {text}
      </Button>
      {state === "error" ? (
        <div role="alert">
          <Callout
            tone={needsBusinessName ? "warn" : "bad"}
            title={errorMessage}
            action={
              needsBusinessName ? (
                <ButtonLink href={BUSINESS_NAME_REQUIRED.settings_url} variant="secondary">
                  Open Settings
                </ButtonLink>
              ) : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}
