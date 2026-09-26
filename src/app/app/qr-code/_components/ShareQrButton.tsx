"use client";

import { useState } from "react";
import { ShareNetwork } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { isNativeIOSApp } from "@/lib/native-app";

const FILE_NAME = "request-qr-code.png";

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/**
 * The QR code as a PNG, to the share sheet: Print, Save Image, AirDrop,
 * Mail. For the iPhone app, where WKWebView ignores window.print, a
 * download and navigator.share with files, so it goes through Capacitor
 * (written to the cache, then handed to Share), as SavePdfButton does.
 * Anywhere else it uses the browser's share sheet, or downloads.
 */
export function ShareQrButton({ href }: { href: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(`request-qr ${res.status}`);
      const blob = await res.blob();
      if (isNativeIOSApp()) {
        const [{ Filesystem, Directory }, { Share }] = await Promise.all([
          import("@capacitor/filesystem"),
          import("@capacitor/share"),
        ]);
        const written = await Filesystem.writeFile({ path: FILE_NAME, data: await base64Of(blob), directory: Directory.Cache });
        try {
          await Share.share({ title: "Your QR code", url: written.uri });
        } catch {
          // Sheet dismissed: not an error.
        }
        return;
      }
      const file = new File([blob], FILE_NAME, { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Your QR code" });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = FILE_NAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.show("Couldn't get the QR code ready. Check your signal and try again.", { tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      fullWidth
      icon={<ShareNetwork weight="bold" />}
      loading={busy}
      loadingLabel="Getting it ready…"
      onClick={share}
      data-testid="qr-share"
    >
      Share or print the QR code
    </Button>
  );
}
