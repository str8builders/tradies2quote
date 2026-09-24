"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Barcode, CircleNotch } from "@phosphor-icons/react";
import type { BarcodeMaterial } from "../barcode-actions";
import type { LibraryPick, ScanMode } from "./BarcodeScanViews";

// The sheet (camera, decoder and forms) is its own chunk, fetched the first
// time the tradie taps "Scan barcode" — never part of the page's first load.
const BarcodeScanSheet = dynamic(
  () => import("./BarcodeScanSheet").then((m) => m.BarcodeScanSheet),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70" role="status">
        <CircleNotch size={40} weight="bold" className="text-brand motion-safe:animate-spin" aria-hidden="true" />
        <span className="sr-only">Opening the scanner…</span>
      </div>
    ),
  },
);

type Props = {
  /** library: found items open; quote: found items are added as a line. */
  mode: ScanMode;
  currency: string;
  library?: readonly LibraryPick[];
  onAddToQuote?: (material: BarcodeMaterial) => void;
  className?: string;
};

export function ScanBarcodeButton({ mode, currency, library, onAddToQuote, className }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-testid="scan-barcode-button"
        className={className ?? "t2q-btn-ghost-pro"}
      >
        <Barcode size={20} weight="bold" aria-hidden="true" />
        Scan barcode
      </button>
      {open ? (
        <BarcodeScanSheet
          mode={mode}
          currency={currency}
          library={library}
          onAddToQuote={onAddToQuote}
          onClose={close}
        />
      ) : null}
    </>
  );
}
