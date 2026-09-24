"use client";

import { useState, type ReactNode, type Ref } from "react";
import {
  ArrowCounterClockwise,
  Camera,
  CameraSlash,
  CheckCircle,
  CircleNotch,
  Keyboard,
  Link as LinkIcon,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";
import { BARCODE_UNITS, type BarcodeUnit } from "@/lib/materials/barcode";
import { formatCurrency } from "@/lib/quote-defaults";
import type { BarcodeConflict, BarcodeMaterial } from "../barcode-actions";

// The scanner's screens. Each one is a plain function of its props — the
// camera, decoding and server calls live in BarcodeScanSheet — so every
// screen can be rendered on its own in tests.

export type ScanMode = "library" | "quote";

/**
 * starting/live: the camera is coming up or reading. paused: stopped while the
 * page was hidden or a photo was being taken. The rest are problems:
 * denied (permission off), busy (another app has it), unavailable (no camera
 * or no camera API here), error (it didn't start), reader (the decoder
 * didn't load).
 */
export type CameraStatus =
  | "starting"
  | "live"
  | "paused"
  | "denied"
  | "busy"
  | "unavailable"
  | "error"
  | "reader";

/** What the "already in my library" picker needs from each item. */
export type LibraryPick = Pick<BarcodeMaterial, "id" | "name" | "unit" | "default_unit_price">;

export type NewProductValues = {
  name: string;
  unit: BarcodeUnit;
  price: string;
  priceIncludesGst: boolean;
};

// `!` because the app shell (premium.css / redesign.css) restyles these
// buttons with more specific rules (46px tall, 13–14px text): the scanner's
// primary actions stay 56px and every button 48px+ with 16px words.
const PRIMARY = "t2q-btn-primary-pro !min-h-14 w-full !text-base disabled:cursor-not-allowed disabled:opacity-60";
const GHOST = "t2q-btn-ghost-pro !min-h-12 w-full !text-base disabled:cursor-not-allowed disabled:opacity-60";
const EYEBROW = "font-mono text-[11px] uppercase tracking-[0.2em] text-brand";
const FIELD =
  "mt-2 block h-14 w-full rounded-lg border border-ink-600 bg-ink-800 px-4 text-base text-white placeholder:text-ink-500 outline-none focus:border-brand";

/** Heading each screen starts with; focus lands here when the screen changes. */
function StepHeading({ children }: { children: ReactNode }) {
  return (
    <h3
      tabIndex={-1}
      data-step-heading
      className="font-display text-2xl uppercase tracking-tight text-white outline-none"
    >
      {children}
    </h3>
  );
}

function priceLabel(material: Pick<BarcodeMaterial, "unit" | "default_unit_price">, currency: string) {
  if (material.default_unit_price === null || !(material.default_unit_price > 0)) {
    return "No price saved yet";
  }
  return `${formatCurrency(material.default_unit_price, currency)} / ${material.unit || "each"}`;
}

function BarcodeNumber({ code }: { code: string }) {
  return (
    <p className="mt-1 font-mono text-xs text-ink-400">
      Barcode <span className="break-all text-ink-200">{code}</span>
    </p>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm text-red-200"
    >
      <WarningCircle size={20} weight="bold" className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

const CAMERA_PROBLEM: Record<Exclude<CameraStatus, "starting" | "live" | "paused">, string> = {
  denied:
    "Camera access is turned off for Tradies2Quote — allow the camera in your phone's settings for this app or browser, then tap Try again.",
  busy: "Another app is using the camera. Close it, then tap Try again.",
  unavailable: "We can't use a camera here. Take a photo of the barcode or type the number instead.",
  error: "The camera didn't start. Tap Try again, or take a photo of the barcode instead.",
  reader: "The scanner didn't load. Check your connection and tap Try again, or type the number instead.",
};

export function CameraStep({
  status,
  hint,
  videoRef,
  viewRef,
  onRetry,
  onTakePhoto,
  onTypeNumber,
}: {
  status: CameraStatus;
  hint: string | null;
  videoRef: Ref<HTMLVideoElement>;
  viewRef: Ref<HTMLDivElement>;
  onRetry: () => void;
  onTakePhoto: () => void;
  onTypeNumber: () => void;
}) {
  const showVideo = status === "starting" || status === "live";
  const problem = status === "starting" || status === "live" || status === "paused" ? null : CAMERA_PROBLEM[status];
  const message =
    status === "starting"
      ? "Starting the camera…"
      : status === "live"
        ? (hint ?? "Point the camera at the barcode. Hold still — it reads by itself.")
        : "Camera paused.";

  return (
    <div data-testid="barcode-camera-step" data-camera={status}>
      {showVideo || status === "paused" ? (
        <div
          ref={viewRef}
          className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black"
        >
          {showVideo ? (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          {/* Framing box: dims everything outside it. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[8%] inset-y-[20%] rounded-xl border-2 border-brand shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
          >
            {status === "live" ? (
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-brand/80 motion-safe:animate-pulse" />
            ) : null}
          </div>
          {status === "starting" ? (
            <div className="absolute inset-0 grid place-items-center">
              <CircleNotch size={36} weight="bold" className="text-white motion-safe:animate-spin" aria-hidden="true" />
            </div>
          ) : null}
          {status === "paused" ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <button type="button" onClick={onRetry} className="t2q-btn-primary-pro !min-h-14 !text-base">
                <Camera size={22} weight="bold" aria-hidden="true" />
                Start the camera
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-ink-800 p-5 text-center">
          <CameraSlash size={40} weight="duotone" className="mx-auto text-brand" aria-hidden="true" />
          {/* An alert, so a screen reader says why the camera stopped. */}
          <p role="alert" className="mt-3 text-base text-white">
            {problem}
          </p>
          {status !== "unavailable" ? (
            <button type="button" onClick={onRetry} className={`${PRIMARY} mt-4`}>
              <ArrowCounterClockwise size={20} weight="bold" aria-hidden="true" />
              Try again
            </button>
          ) : null}
        </div>
      )}

      {showVideo || status === "paused" ? (
        <p role="status" aria-live="polite" className="mt-3 min-h-[1.5rem] text-center text-sm text-ink-200">
          {message}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <button type="button" onClick={onTakePhoto} className={GHOST} data-testid="barcode-take-photo">
          <Camera size={20} weight="bold" aria-hidden="true" />
          Take a photo of the barcode
        </button>
        <button type="button" onClick={onTypeNumber} className={GHOST} data-testid="barcode-type-number">
          <Keyboard size={20} weight="bold" aria-hidden="true" />
          Type the number instead
        </button>
      </div>
    </div>
  );
}

export function TypeNumberStep({
  error,
  onSubmit,
  onUseCamera,
}: {
  error: string | null;
  onSubmit: (value: string) => void;
  onUseCamera: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      data-testid="barcode-type-step"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <StepHeading>Type the number</StepHeading>
      <p className="mt-2 text-sm text-ink-300">It&apos;s printed under the barcode lines.</p>
      <label className="mt-4 block">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300">Barcode number</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          placeholder="9 415000 000000"
          aria-invalid={error ? true : undefined}
          data-testid="barcode-number-input"
          className={`${FIELD} font-mono tracking-wider`}
        />
      </label>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="mt-5 space-y-2">
        <button type="submit" className={PRIMARY}>
          <MagnifyingGlass size={20} weight="bold" aria-hidden="true" />
          Look it up
        </button>
        <button type="button" onClick={onUseCamera} className={GHOST}>
          <Camera size={20} weight="bold" aria-hidden="true" />
          Use the camera
        </button>
      </div>
    </form>
  );
}

export function BusyStep({ label }: { label: string }) {
  return (
    <div data-testid="barcode-busy-step" className="grid min-h-[16rem] place-items-center text-center" role="status">
      <div>
        <CircleNotch size={40} weight="bold" className="mx-auto text-brand motion-safe:animate-spin" aria-hidden="true" />
        <p className="mt-3 text-base text-white">{label}</p>
      </div>
    </div>
  );
}

export function FoundStep({
  mode,
  material,
  code,
  currency,
  added,
  onAddToQuote,
  onOpen,
  onScanAnother,
  onDone,
}: {
  mode: ScanMode;
  material: BarcodeMaterial;
  code: string;
  currency: string;
  added: boolean;
  onAddToQuote: () => void;
  onOpen: () => void;
  onScanAnother: () => void;
  onDone: () => void;
}) {
  return (
    <div data-testid="barcode-found-step">
      <p className={EYEBROW}>{added ? "// added to your quote" : "// in your library"}</p>
      <div className="mt-2">
        <StepHeading>{material.name}</StepHeading>
      </div>
      <p className="mt-2 text-xl text-white tabular-nums" data-testid="barcode-found-price">
        {priceLabel(material, currency)}
      </p>
      <BarcodeNumber code={code} />
      {added ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          <CheckCircle size={20} weight="fill" className="mt-px shrink-0 text-emerald-400" aria-hidden="true" />
          Added as 1 {material.unit || "each"}. Change the quantity on the quote, then save.
        </p>
      ) : null}
      <div className="mt-5 space-y-2">
        {added ? (
          <>
            <button type="button" onClick={onScanAnother} className={PRIMARY}>
              <Camera size={20} weight="bold" aria-hidden="true" />
              Scan another
            </button>
            <button type="button" onClick={onDone} className={GHOST}>
              Done
            </button>
          </>
        ) : (
          <>
            {mode === "quote" ? (
              <button type="button" onClick={onAddToQuote} className={PRIMARY} data-testid="barcode-add-to-quote">
                Add to quote
              </button>
            ) : (
              <button type="button" onClick={onOpen} className={PRIMARY} data-testid="barcode-open-material">
                Open
              </button>
            )}
            <button type="button" onClick={onScanAnother} className={GHOST}>
              <Camera size={20} weight="bold" aria-hidden="true" />
              Scan another
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LibraryPicker({
  library,
  currency,
  disabled,
  onPick,
  onBack,
}: {
  library: readonly LibraryPick[];
  currency: string;
  disabled: boolean;
  onPick: (item: LibraryPick) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (q ? library.filter((m) => m.name.toLowerCase().includes(q)) : library).slice(0, 8);
  return (
    <div data-testid="barcode-library-picker">
      <p className="text-sm text-ink-300">Pick the item and we&apos;ll save this barcode on it.</p>
      <label className="mt-3 block">
        <span className="sr-only">Search your library</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library"
          autoComplete="off"
          className={FIELD}
        />
      </label>
      {matches.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">
          {library.length === 0 ? "Your library is empty." : "Nothing matches that."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(m)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-ink-800 px-4 py-2 text-left hover:border-brand disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base text-white">{m.name}</span>
                  <span className="block text-xs text-ink-400">{priceLabel(m, currency)}</span>
                </span>
                <LinkIcon size={18} weight="bold" className="shrink-0 text-brand" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onBack} className={`${GHOST} mt-3`}>
        Back to the new product
      </button>
    </div>
  );
}

export function NewProductStep({
  mode,
  code,
  currency,
  library,
  saving,
  error,
  conflict,
  onSave,
  onAttach,
  onScanAnother,
}: {
  mode: ScanMode;
  code: string;
  currency: string;
  library: readonly LibraryPick[];
  saving: boolean;
  error: string | null;
  conflict: BarcodeConflict | null;
  onSave: (values: NewProductValues) => void;
  onAttach: (item: { id: string; name: string }) => void;
  onScanAnother: () => void;
}) {
  const [values, setValues] = useState<NewProductValues>({
    name: "",
    unit: "each",
    price: "",
    priceIncludesGst: false,
  });
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = problem ?? error;

  function submit() {
    const price = Number(values.price.replace(/[$,\s]/g, ""));
    if (!values.name.trim()) return setProblem("Give it a name so you can find it next time.");
    if (!Number.isFinite(price) || price <= 0) return setProblem("Enter a price above $0.");
    setProblem(null);
    onSave(values);
  }

  return (
    <div data-testid="barcode-new-step">
      <p className={EYEBROW}>{"// new to your library"}</p>
      <div className="mt-2">
        <StepHeading>What is this?</StepHeading>
      </div>
      <BarcodeNumber code={code} />

      {picking ? (
        <div className="mt-4">
          <LibraryPicker
            library={library}
            currency={currency}
            disabled={saving}
            onPick={onAttach}
            onBack={() => setPicking(false)}
          />
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300">
              Name<span className="ml-1 text-brand">*</span>
            </span>
            <input
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              required
              maxLength={120}
              autoComplete="off"
              autoCapitalize="sentences"
              placeholder="e.g. Sikaflex 11FC grey 300ml"
              data-testid="barcode-new-name"
              className={FIELD}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300">Unit</span>
              <select
                value={values.unit}
                onChange={(e) => setValues({ ...values, unit: e.target.value as BarcodeUnit })}
                data-testid="barcode-new-unit"
                className={FIELD}
              >
                {BARCODE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300">
                Price ex GST<span className="ml-1 text-brand">*</span>
              </span>
              <input
                value={values.price}
                onChange={(e) => setValues({ ...values, price: e.target.value })}
                required
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                data-testid="barcode-new-price"
                className={`${FIELD} tabular-nums`}
              />
            </label>
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm text-ink-200">
            <input
              type="checkbox"
              checked={values.priceIncludesGst}
              onChange={(e) => setValues({ ...values, priceIncludesGst: e.target.checked })}
              className="h-5 w-5 accent-brand"
            />
            This price includes GST (we&apos;ll save it without)
          </label>

          {shown ? <ErrorNote>{shown}</ErrorNote> : null}
          {conflict?.kind === "name" && !problem ? (
            <button
              type="button"
              onClick={() => onAttach(conflict)}
              disabled={saving}
              className={GHOST}
              data-testid="barcode-attach-conflict"
            >
              <LinkIcon size={20} weight="bold" aria-hidden="true" />
              Add barcode to {conflict.name}
            </button>
          ) : null}

          <div className="space-y-2 pt-1">
            <button type="submit" disabled={saving} className={PRIMARY} data-testid="barcode-new-save">
              {saving ? "Saving…" : mode === "quote" ? "Save and add to quote" : "Save to my library"}
            </button>
            {library.length > 0 ? (
              <button type="button" onClick={() => setPicking(true)} disabled={saving} className={GHOST}>
                <LinkIcon size={20} weight="bold" aria-hidden="true" />
                It&apos;s already in my library
              </button>
            ) : null}
            <button type="button" onClick={onScanAnother} disabled={saving} className={GHOST}>
              <Camera size={20} weight="bold" aria-hidden="true" />
              Scan something else
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function SavedStep({
  mode,
  material,
  currency,
  attached,
  replaced,
  onOpen,
  onScanAnother,
  onDone,
}: {
  mode: ScanMode;
  material: BarcodeMaterial;
  currency: string;
  attached: boolean;
  replaced: boolean;
  onOpen: () => void;
  onScanAnother: () => void;
  onDone: () => void;
}) {
  const headline = attached ? "Barcode saved" : "Saved to your library";
  return (
    <div data-testid="barcode-saved-step">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
        <CheckCircle size={16} weight="fill" aria-hidden="true" />
        {mode === "quote" ? `${headline} · added to your quote` : headline}
      </p>
      <div className="mt-2">
        <StepHeading>{material.name}</StepHeading>
      </div>
      <p className="mt-2 text-xl text-white tabular-nums">{priceLabel(material, currency)}</p>
      <p className="mt-3 text-sm text-ink-300">
        {replaced ? "Its old barcode was replaced. " : ""}
        Next time you scan it, it comes straight up.
        {mode === "quote" ? " Change the quantity on the quote, then save." : ""}
      </p>
      <div className="mt-5 space-y-2">
        <button type="button" onClick={onScanAnother} className={PRIMARY}>
          <Camera size={20} weight="bold" aria-hidden="true" />
          Scan another
        </button>
        {mode === "library" ? (
          <button type="button" onClick={onOpen} className={GHOST}>
            Open
          </button>
        ) : null}
        <button type="button" onClick={onDone} className={GHOST}>
          Done
        </button>
      </div>
    </div>
  );
}

export function ErrorStep({
  message,
  retryLabel,
  onRetry,
  onTypeNumber,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  onTypeNumber: () => void;
}) {
  return (
    <div data-testid="barcode-error-step">
      <StepHeading>Let&apos;s try that again</StepHeading>
      <ErrorNote>{message}</ErrorNote>
      <div className="mt-5 space-y-2">
        <button type="button" onClick={onRetry} className={PRIMARY}>
          <ArrowCounterClockwise size={20} weight="bold" aria-hidden="true" />
          {retryLabel}
        </button>
        <button type="button" onClick={onTypeNumber} className={GHOST}>
          <Keyboard size={20} weight="bold" aria-hidden="true" />
          Type the number instead
        </button>
      </div>
    </div>
  );
}
