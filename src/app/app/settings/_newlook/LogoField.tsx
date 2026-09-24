"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { useToast } from "@/components/ui/toast";
import { prepareLogoImage } from "@/lib/imagePrep";
import { removeBusinessLogoAction, uploadBusinessLogoAction } from "../logo-actions";

// Same picker rules as the old logo field: let the iOS Photos picker hand
// over a HEIC (converted to JPEG before upload); the action still accepts
// only PNG and JPG.
const CLIENT_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,.heic,.heif";
const LIKELY_IMAGE_RE = /\.(png|jpe?g|webp|hei[cf])$/i;

function isLikelyImage(file: File): boolean {
  if (/^image\//i.test(file.type)) return true;
  if (!file.type) return LIKELY_IMAGE_RE.test(file.name);
  return false;
}

/**
 * The business logo, saved the moment it is picked (the existing logo
 * actions), so it sits outside the page's Save button.
 */
export function LogoField({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    // Clear so picking the same file again still fires.
    event.target.value = "";
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
        // Keep the original; the action checks format and size again.
      }
      const formData = new FormData();
      formData.append("logo", prepared);
      try {
        const result = await uploadBusinessLogoAction(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.show("Logo saved");
        router.refresh();
      } catch {
        setError("Upload failed. Try a smaller image or check your signal.");
      }
    });
  };

  const onRemove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeBusinessLogoAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show("Logo removed");
      router.refresh();
    });
  };

  return (
    <div data-testid="settings-logo-field">
      <p className="mb-2 text-ui-base font-semibold text-ui-text">Logo</p>
      <div className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          // Logos are drawn for white paper and the PDF is white paper, so
          // the preview plate stays white in every palette.
          <div
            data-testid="settings-logo-preview"
            style={{ backgroundColor: "white" }}
            className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-ui-md border border-ui-line p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, no optimiser */}
            <img src={logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div
            data-testid="settings-logo-preview"
            className="flex h-24 w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-ui-md border-2 border-dashed border-ui-line-strong bg-ui-surface-2 text-ui-muted"
          >
            <ImageIcon aria-hidden="true" weight="regular" className="text-[2rem]" />
            <span className="text-ui-sm">No logo yet</span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* The file input covers the button (opacity 0): iOS only opens the
              photo picker for a tap that lands on the input itself. */}
          <label
            aria-disabled={pending}
            data-testid="settings-logo-upload"
            className={cx(
              buttonClasses({ variant: "secondary", loading: pending }),
              "ui-focus-within-ring overflow-hidden",
              pending ? "pointer-events-none" : "cursor-pointer",
            )}
          >
            <UploadSimple aria-hidden="true" weight="bold" className="text-[1.15em]" />
            <span>{pending ? "Saving…" : logoUrl ? "Change logo" : "Add your logo"}</span>
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
            <Button
              variant="ghost"
              icon={<Trash weight="bold" />}
              onClick={onRemove}
              disabled={pending}
              data-testid="settings-logo-remove"
            >
              Remove logo
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" data-testid="settings-logo-error" className="mt-2 flex items-start gap-1.5 text-ui-sm font-semibold text-ui-bad">
          <WarningCircle aria-hidden="true" weight="bold" className="mt-0.5 shrink-0 text-[1.125rem]" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="mt-2 text-ui-sm text-ui-muted">
          PNG or JPG. It saves as soon as you pick it and goes on every quote and invoice.
        </p>
      )}
    </div>
  );
}
