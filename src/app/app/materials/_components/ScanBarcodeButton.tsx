"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Barcode, CircleNotch, SpinnerGap } from "@phosphor-icons/react";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { UI_TEXT } from "@/components/ui/styles";
import type { BarcodeMaterial } from "../barcode-actions";
import type { LibraryPick, ScanLook, ScanMode } from "./BarcodeScanViews";

/** Covers the page while the sheet's code loads, so a second tap can't land meanwhile. */
export function OpeningScanner({ look }: { look: ScanLook }) {
  if (look === "new") {
    // Not dimmed: the kit sheet fades in its own scrim, so the page doesn't go dim, clear, dim.
    return (
      <div className={cx("fixed inset-0 z-[70] grid place-items-center p-6", UI_TEXT)} role="status">
        <p className="flex items-center gap-3 rounded-ui-lg border border-ui-line bg-ui-surface px-5 py-4 text-ui-base font-semibold shadow-ui-raised">
          <SpinnerGap
            aria-hidden="true"
            weight="bold"
            className="shrink-0 animate-spin text-[1.5rem] text-ui-brand-text motion-reduce:animate-spin-calm"
          />
          Opening the scanner…
        </p>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70" role="status">
      <CircleNotch size={40} weight="bold" className="text-brand motion-safe:animate-spin" aria-hidden="true" />
      <span className="sr-only">Opening the scanner…</span>
    </div>
  );
}

// The sheet (camera, decoder and forms) is its own chunk, fetched the first
// time the tradie taps "Scan barcode" — never part of the page's first load.
// One loader per look, for its placeholder; both fetch the same chunk.
const ClassicScanSheet = dynamic(() => import("./BarcodeScanSheet").then((m) => m.BarcodeScanSheet), {
  ssr: false,
  loading: () => <OpeningScanner look="classic" />,
});
const NewLookScanSheet = dynamic(() => import("./BarcodeScanSheet").then((m) => m.BarcodeScanSheet), {
  ssr: false,
  loading: () => <OpeningScanner look="new" />,
});

type Props = {
  /** library: found items open; quote: found items are added as a line. */
  mode: ScanMode;
  currency: string;
  library?: readonly LibraryPick[];
  onAddToQuote?: (material: BarcodeMaterial) => void;
  className?: string;
  /** "new": the sheet in the new look (kit parts, ui- tokens, outdoor mode). */
  look?: ScanLook;
};

export function ScanBarcodeButton({ mode, currency, library, onAddToQuote, className, look = "classic" }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);

  // Back to the button once the sheet has gone. Not straight away: the new
  // look's sheet is a modal <dialog>, and until it unmounts the page behind
  // it is inert and can't take focus.
  useEffect(() => {
    if (open || !closing.current) return;
    closing.current = false;
    triggerRef.current?.focus({ preventScroll: true });
  }, [open]);

  function close() {
    closing.current = true;
    setOpen(false);
  }

  const Sheet = look === "new" ? NewLookScanSheet : ClassicScanSheet;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-testid="scan-barcode-button"
        className={className ?? (look === "new" ? buttonClasses({ variant: "secondary" }) : "t2q-btn-ghost-pro")}
      >
        {look === "new" ? (
          <span aria-hidden="true" className="inline-flex shrink-0 text-[1.15em]">
            <Barcode weight="bold" />
          </span>
        ) : (
          <Barcode size={20} weight="bold" aria-hidden="true" />
        )}
        Scan barcode
      </button>
      {open ? (
        <Sheet
          mode={mode}
          currency={currency}
          library={library}
          onAddToQuote={onAddToQuote}
          onClose={close}
          look={look}
        />
      ) : null}
    </>
  );
}
