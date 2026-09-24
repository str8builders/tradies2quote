"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { useToast } from "@/components/ui/toast";
import { prepareAvatarImage } from "@/lib/imagePrep";
import { removeAvatarAction, uploadAvatarAction } from "@/app/app/_components/account-hub-actions";

// The account menu's picker rules: HEIC is converted to JPEG before upload,
// and the action re-checks the type and size.
const CLIENT_ACCEPT = "image/jpeg,image/png,image/webp,image/jpg,image/heic,image/heif,.heic,.heif";
const SAFE_EXT_RE = /\.(jpe?g|png|webp|hei[cf])$/i;

function isLikelyImage(file: File): boolean {
  if (/^image\/(jpe?g|png|webp|hei[cf])$/i.test(file.type)) return true;
  if (!file.type) return SAFE_EXT_RE.test(file.name);
  return false;
}

/** The first letter of the email, shown when there is no photo. */
export function avatarInitial(email: string | null | undefined): string {
  return (email ?? "?").trim().charAt(0).toUpperCase() || "?";
}

/** Your photo (the existing avatar actions) and who is signed in. */
export function AvatarField({ avatarUrl, email }: { avatarUrl: string | null; email: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isLikelyImage(file)) {
      setError("Use a JPG, PNG or WebP photo.");
      return;
    }
    startTransition(async () => {
      let prepared = file;
      try {
        prepared = await prepareAvatarImage(file);
      } catch {
        // Keep the original; the action checks it again.
      }
      const formData = new FormData();
      formData.append("avatar", prepared);
      try {
        const result = await uploadAvatarAction(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.show("Photo saved");
        router.refresh();
      } catch {
        setError("Upload failed. Try a smaller photo or check your signal.");
      }
    });
  };

  const onRemove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show("Photo removed");
      router.refresh();
    });
  };

  return (
    <div data-testid="settings-avatar-field" className="space-y-4">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public storage URL, no optimiser
          <img
            src={avatarUrl}
            alt="Your photo"
            width={72}
            height={72}
            className="h-18 w-18 shrink-0 rounded-full border border-ui-line object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex h-18 w-18 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-ui-2xl font-semibold text-ui-brand-text"
          >
            {avatarInitial(email)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-ui-sm text-ui-muted">Signed in as</p>
          <p className="font-semibold break-all text-ui-text" data-testid="settings-signed-in-email">
            {email ?? "Unknown"}
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {/* The file input covers the button: iOS opens the photo picker only
            for a tap on the input itself. */}
        <label
          aria-disabled={pending}
          data-testid="settings-avatar-upload"
          className={cx(
            buttonClasses({ variant: "secondary", loading: pending }),
            "ui-focus-within-ring overflow-hidden",
            pending ? "pointer-events-none" : "cursor-pointer",
          )}
        >
          <Camera aria-hidden="true" weight="bold" className="text-[1.15em]" />
          <span>{pending ? "Saving…" : avatarUrl ? "Change photo" : "Add a photo"}</span>
          <input
            type="file"
            accept={CLIENT_ACCEPT}
            onChange={onPick}
            disabled={pending}
            data-testid="settings-avatar-input"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        {avatarUrl ? (
          <Button variant="ghost" icon={<Trash weight="bold" />} onClick={onRemove} disabled={pending}>
            Remove photo
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-ui-sm font-semibold text-ui-bad">
          <WarningCircle aria-hidden="true" weight="bold" className="mt-0.5 shrink-0 text-[1.125rem]" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="text-ui-sm text-ui-muted">Shows in the app&apos;s menu. JPG, PNG, WebP or iPhone photos.</p>
      )}
    </div>
  );
}
