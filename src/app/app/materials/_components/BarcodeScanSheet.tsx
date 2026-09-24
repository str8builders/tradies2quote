"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Barcode, X } from "@phosphor-icons/react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { normalizeBarcode, pickScannedCode } from "@/lib/materials/barcode";
import type { DecodedBarcode, Scanner } from "@/lib/materials/barcodeReader";
import {
  lookupBarcodeAction,
  saveBarcodeMaterialAction,
  type BarcodeConflict,
  type BarcodeLookupResult,
  type BarcodeMaterial,
  type SaveBarcodeInput,
  type SaveBarcodeResult,
} from "../barcode-actions";
import {
  BusyStep,
  CameraStep,
  ErrorStep,
  FoundStep,
  NewProductStep,
  SavedStep,
  TypeNumberStep,
  type CameraStatus,
  type LibraryPick,
  type NewProductValues,
  type ScanMode,
} from "./BarcodeScanViews";

/**
 * The barcode scanner, as a bottom sheet (a centred dialog on wider screens).
 * Loaded on demand by ScanBarcodeButton; the decoder itself is loaded with a
 * dynamic import once the sheet opens (src/lib/materials/barcodeReader.ts).
 *
 * Flow: live camera → a code is read → look it up in the tradie's library →
 * found (add to quote / open) or new ("What is this?" → save with the code).
 * A photo of the barcode and typing the number are always available, and are
 * what's left when the camera is blocked or missing. Every camera track is
 * stopped on close, on unmount, when the page is hidden and after a read.
 */
export type BarcodeScanSheetProps = {
  mode: ScanMode;
  currency: string;
  /** The tradie's library, for "It's already in my library". */
  library?: readonly LibraryPick[];
  /** Quote editor: append the item as a line (only offered when editable). */
  onAddToQuote?: (material: BarcodeMaterial) => void;
  onClose: () => void;
};

type NewStep = {
  step: "new";
  code: string;
  format: string | null;
  saving: boolean;
  error: string | null;
  conflict: BarcodeConflict | null;
};

type Phase =
  | { step: "camera" }
  | { step: "type"; error: string | null }
  | { step: "busy"; label: string }
  | { step: "found"; code: string; material: BarcodeMaterial; added: boolean }
  | NewStep
  | { step: "saved"; material: BarcodeMaterial; attached: boolean; replaced: boolean }
  | { step: "error"; message: string; retry: "lookup" | "photo" };

/** ≈6–7 reads a second; never back-to-back, so the page stays responsive. */
const SCAN_INTERVAL_MS = 150;
const MIN_GAP_MS = 60;
/** Consecutive reader errors before the live scan gives up. */
const MAX_FAILED_READS = 8;
const VIBRATE_MS = 60;
const CAMERA: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
};

const LOOKUP_OFFLINE = "We couldn't check that barcode. Check your connection and try again.";
const SAVE_OFFLINE = "We couldn't save that. Check your connection and try again.";
const PHOTO_NO_CODE =
  "We couldn't find a barcode in that photo. Get close so the barcode fills most of the photo, keep it flat and in focus — or type the number.";
const PHOTO_UNREADABLE = "We couldn't open that photo. Try another one, or type the number.";
const READER_OFFLINE = "The scanner didn't load. Check your connection, then try again — or type the number.";

function canUseCamera(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/** Map a getUserMedia failure to what the tradie can do about it. */
function cameraProblem(error: unknown): CameraStatus {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "unavailable";
  return "error";
}

function vibrate() {
  try {
    navigator.vibrate?.(VIBRATE_MS);
  } catch {
    // Not every browser allows it (iOS has no vibrate at all).
  }
}

type Session = {
  /** Bumped by every stop; async camera work checks it before touching state. */
  run: number;
  stream: MediaStream | null;
  timer: number | null;
  scanner: Promise<Scanner> | null;
  /** A code with no check digit seen once, waiting for a matching read. */
  pending: string | null;
  failures: number;
  mounted: boolean;
  lastLookup: { code: string; format: string | null } | null;
};

export function BarcodeScanSheet({ mode, currency, library = [], onAddToQuote, onClose }: BarcodeScanSheetProps) {
  const router = useRouter();
  const titleId = useId();
  const [phase, setPhase] = useState<Phase>({ step: "camera" });
  const [camera, setCamera] = useState<CameraStatus>(() => (canUseCamera() ? "starting" : "unavailable"));
  const [hint, setHint] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const session = useRef<Session>({
    run: 0,
    stream: null,
    timer: null,
    scanner: null,
    pending: null,
    failures: 0,
    mounted: false,
    lastLookup: null,
  });
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useBodyScrollLock(true);

  const getScanner = useCallback((): Promise<Scanner> => {
    const s = session.current;
    s.scanner ??= import("@/lib/materials/barcodeReader")
      .then(async (m) => m.createScanner(await m.loadBarcodeReader()))
      .catch((error: unknown) => {
        s.scanner = null;
        throw error;
      });
    return s.scanner;
  }, []);

  const stopCamera = useCallback(() => {
    const s = session.current;
    s.run += 1;
    if (s.timer !== null) {
      window.clearTimeout(s.timer);
      s.timer = null;
    }
    s.stream?.getTracks().forEach((track) => track.stop());
    s.stream = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const lookUp = useCallback(async (code: string, format: string | null) => {
    const s = session.current;
    s.lastLookup = { code, format };
    setPhase({ step: "busy", label: "Checking your library…" });
    let result: BarcodeLookupResult;
    try {
      result = await lookupBarcodeAction(code, format);
    } catch {
      if (s.mounted) setPhase({ step: "error", message: LOOKUP_OFFLINE, retry: "lookup" });
      return;
    }
    if (!s.mounted) return;
    if ("error" in result) {
      setPhase({ step: "error", message: result.error, retry: "lookup" });
    } else if (result.material) {
      setPhase({ step: "found", code: result.code, material: result.material, added: false });
    } else {
      setPhase({ step: "new", code: result.code, format, saving: false, error: null, conflict: null });
    }
  }, []);

  const startLoop = useCallback(
    (scanner: Scanner, run: number) => {
      const s = session.current;
      const tick = async () => {
        s.timer = null;
        if (run !== s.run) return;
        const started = performance.now();
        const video = videoRef.current;
        const view = viewRef.current;
        if (video && view) {
          try {
            const reads = await scanner.readFrame(video, { width: view.clientWidth, height: view.clientHeight });
            if (run !== s.run) return;
            s.failures = 0;
            if (reads) {
              const pick = pickScannedCode(reads, s.pending);
              if (pick.kind === "accept") {
                stopCamera();
                vibrate();
                void lookUp(pick.code, pick.format);
                return;
              }
              if (pick.kind === "confirm") s.pending = pick.key;
              if (pick.kind === "reject") setHint(pick.reason);
            }
          } catch {
            if (run !== s.run) return;
            s.failures += 1;
            if (s.failures >= MAX_FAILED_READS) {
              stopCamera();
              setCamera("reader");
              return;
            }
          }
        }
        const wait = Math.max(MIN_GAP_MS, SCAN_INTERVAL_MS - (performance.now() - started));
        s.timer = window.setTimeout(tick, wait);
      };
      s.timer = window.setTimeout(tick, 0);
    },
    [lookUp, stopCamera],
  );

  /** Ask for the camera and start reading. Sets state only after it awaits. */
  const openCamera = useCallback(async () => {
    const s = session.current;
    const run = s.run;
    s.pending = null;
    s.failures = 0;
    const scanner = getScanner();
    scanner.catch(() => undefined); // handled below; the decoder loads while the prompt is up
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(CAMERA);
    } catch (error) {
      if (run === s.run && s.mounted) setCamera(cameraProblem(error));
      return;
    }
    if (run !== s.run || !s.mounted) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    s.stream = stream;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (run !== s.run) return;
      stopCamera();
      setCamera("error");
    });
    const video = videoRef.current;
    if (!video) {
      stopCamera();
      setCamera("error");
      return;
    }
    video.muted = true;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // autoPlay keeps trying; frames still arrive for reading.
    }
    let ready: Scanner;
    try {
      ready = await scanner;
    } catch {
      if (run === s.run) {
        stopCamera();
        setCamera("reader");
      }
      return;
    }
    if (run !== s.run) return;
    setCamera("live");
    startLoop(ready, run);
  }, [getScanner, startLoop, stopCamera]);

  const startCamera = useCallback(() => {
    stopCamera();
    setHint(null);
    setPhase({ step: "camera" });
    if (!canUseCamera()) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    void openCamera();
  }, [openCamera, stopCamera]);

  // Open the camera with the sheet; release it however the sheet goes away.
  useEffect(() => {
    const s = session.current;
    s.mounted = true;
    if (canUseCamera()) void openCamera();
    return () => {
      s.mounted = false;
      stopCamera();
    };
  }, [openCamera, stopCamera]);

  // A hidden page (app switch, lock screen, the photo picker) frees the camera.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      stopCamera();
      setCamera((status) => (status === "starting" || status === "live" ? "paused" : status));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopCamera]);

  // Dialog keyboard: Escape closes, Tab stays inside. Focus starts on Close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])"),
      ).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // When a screen replaces the button that had focus, put focus on the new
  // screen's heading (or Close) so keyboard and screen-reader users follow.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    if (active && active !== document.body && dialog.contains(active)) return;
    const target =
      dialog.querySelector<HTMLElement>("[data-step-heading]") ?? dialog.querySelector<HTMLElement>("[data-close]");
    target?.focus({ preventScroll: true });
  }, [phase.step]);

  function typeNumber() {
    stopCamera();
    setPhase({ step: "type", error: null });
  }

  function submitNumber(value: string) {
    const parsed = normalizeBarcode(value);
    if (!parsed.ok) {
      setPhase({ step: "type", error: parsed.reason });
      return;
    }
    void lookUp(parsed.code, null);
  }

  function takePhoto() {
    // The system camera takes over; free ours first.
    stopCamera();
    setCamera((status) => (status === "starting" || status === "live" ? "paused" : status));
    photoRef.current?.click();
  }

  async function readPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // choosing the same photo again still fires
    if (!file) return;
    const s = session.current;
    stopCamera();
    setPhase({ step: "busy", label: "Reading the photo…" });
    let reads: DecodedBarcode[];
    try {
      reads = await (await getScanner()).readPhoto(file);
    } catch (error) {
      if (!s.mounted) return;
      const offline = error instanceof Error && error.name === "BarcodeReaderUnavailableError";
      setPhase({ step: "error", message: offline ? READER_OFFLINE : PHOTO_UNREADABLE, retry: "photo" });
      return;
    }
    if (!s.mounted) return;
    const pick = pickScannedCode(reads, null, { singleRead: true });
    if (pick.kind === "accept") {
      vibrate();
      void lookUp(pick.code, pick.format);
      return;
    }
    setPhase({ step: "error", message: pick.kind === "reject" ? pick.reason : PHOTO_NO_CODE, retry: "photo" });
  }

  function retry() {
    if (phase.step !== "error") return;
    const last = session.current.lastLookup;
    if (phase.retry === "lookup" && last) void lookUp(last.code, last.format);
    else if (phase.retry === "photo") photoRef.current?.click();
    else startCamera();
  }

  function openMaterial(material: BarcodeMaterial) {
    router.push(`/app/materials/${material.id}/edit`);
    onClose();
  }

  function addFound() {
    if (phase.step !== "found" || !onAddToQuote) return;
    onAddToQuote(phase.material);
    setPhase({ ...phase, added: true });
  }

  async function save(current: NewStep, input: Omit<SaveBarcodeInput, "code" | "format">) {
    const s = session.current;
    setPhase({ ...current, saving: true, error: null, conflict: null });
    let result: SaveBarcodeResult;
    try {
      result = await saveBarcodeMaterialAction({ code: current.code, format: current.format, ...input });
    } catch {
      if (s.mounted) setPhase({ ...current, saving: false, error: SAVE_OFFLINE, conflict: null });
      return;
    }
    if (!s.mounted) return;
    if ("error" in result) {
      if (result.conflict?.kind === "barcode") {
        // Saved on another item meanwhile (another tab): show that item.
        void lookUp(current.code, current.format);
        return;
      }
      setPhase({ ...current, saving: false, error: result.error, conflict: result.conflict ?? null });
      return;
    }
    if (mode === "quote") onAddToQuote?.(result.material);
    else router.refresh();
    setPhase({ step: "saved", material: result.material, attached: result.attached, replaced: result.replaced });
  }

  function saveNew(values: NewProductValues) {
    if (phase.step !== "new") return;
    void save(phase, {
      name: values.name,
      unit: values.unit,
      price: values.price,
      priceIncludesGst: values.priceIncludesGst,
    });
  }

  function attach(item: { id: string; name: string }) {
    if (phase.step !== "new") return;
    void save(phase, { materialId: item.id });
  }

  let body;
  switch (phase.step) {
    case "camera":
      body = (
        <CameraStep
          status={camera}
          hint={hint}
          videoRef={videoRef}
          viewRef={viewRef}
          onRetry={startCamera}
          onTakePhoto={takePhoto}
          onTypeNumber={typeNumber}
        />
      );
      break;
    case "type":
      body = <TypeNumberStep error={phase.error} onSubmit={submitNumber} onUseCamera={startCamera} />;
      break;
    case "busy":
      body = <BusyStep label={phase.label} />;
      break;
    case "found":
      body = (
        <FoundStep
          mode={mode}
          material={phase.material}
          code={phase.code}
          currency={currency}
          added={phase.added}
          onAddToQuote={addFound}
          onOpen={() => openMaterial(phase.material)}
          onScanAnother={startCamera}
          onDone={onClose}
        />
      );
      break;
    case "new":
      body = (
        <NewProductStep
          mode={mode}
          code={phase.code}
          currency={currency}
          library={library}
          saving={phase.saving}
          error={phase.error}
          conflict={phase.conflict}
          onSave={saveNew}
          onAttach={attach}
          onScanAnother={startCamera}
        />
      );
      break;
    case "saved":
      body = (
        <SavedStep
          mode={mode}
          material={phase.material}
          currency={currency}
          attached={phase.attached}
          replaced={phase.replaced}
          onOpen={() => openMaterial(phase.material)}
          onScanAnother={startCamera}
          onDone={onClose}
        />
      );
      break;
    case "error":
      body = (
        <ErrorStep
          message={phase.message}
          retryLabel={phase.retry === "photo" ? "Take another photo" : "Try again"}
          onRetry={retry}
          onTypeNumber={typeNumber}
        />
      );
      break;
  }

  return (
    <div
      className="t2q-sheet-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      data-testid="barcode-scan-sheet"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="t2q-sheet-panel flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-lg uppercase tracking-tight text-white">
            <Barcode size={24} weight="bold" className="text-brand" aria-hidden="true" />
            Scan barcode
          </h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close scanner"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 text-ink-300 hover:border-brand hover:text-brand"
          >
            <X size={20} weight="bold" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {body}
        </div>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={readPhoto}
          data-testid="barcode-photo-input"
        />
      </div>
    </div>
  );
}
