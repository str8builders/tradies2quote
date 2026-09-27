"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import {
  ArrowCounterClockwise,
  Camera,
  CameraSlash,
  CaretDown,
  CheckCircle,
  Keyboard,
  Link as LinkIcon,
  MagnifyingGlass,
  SpinnerGap,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { TAP } from "@/components/ui/styles";
import { TextField } from "@/components/ui/text-field";
import { BARCODE_UNITS, type BarcodeUnit } from "@/lib/materials/barcode";
import type { BarcodeConflict, BarcodeMaterial } from "../barcode-actions";
import {
  BLANK_NEW_PRODUCT,
  CAMERA_PROBLEM,
  cameraMessage,
  libraryMatches,
  newProductProblem,
  priceLabel,
  type CameraStatus,
  type LibraryPick,
  type NewProductValues,
  type ScanMode,
} from "./BarcodeScanViews";

// The scanner's screens in the new look. Same screens, props, words, test ids,
// roles and checks as BarcodeScanViews (the classic look); only the drawing
// differs: kit parts and ui- tokens, so every screen reads right in dark and
// outdoor mode, and nothing leans on the old app CSS (premium.css).
// BarcodeScanSheet picks this set when it is opened with look="new".

/** Heading each screen starts with; focus lands here when the screen changes. */
function StepHeading({ children }: { children: ReactNode }) {
  return (
    <h3 tabIndex={-1} data-step-heading className="ui-title text-ui-xl break-words text-ui-text outline-none">
      {children}
    </h3>
  );
}

function BarcodeNumber({ code }: { code: string }) {
  return (
    <p className="mt-1 text-ui-sm text-ui-muted">
      Barcode <span className="break-all text-ui-text tabular-nums">{code}</span>
    </p>
  );
}

/** A problem, read out as soon as it shows. */
function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="alert" className={className}>
      <Callout tone="bad" title={children} />
    </div>
  );
}

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
  const problem = showVideo || status === "paused" ? null : CAMERA_PROBLEM[status];

  return (
    <div data-testid="barcode-camera-step" data-camera={status}>
      {problem === null ? (
        // A camera picture, so the viewfinder stays dark in outdoor mode too:
        // ui-chrome is the one surface token that is dark in both themes.
        <div ref={viewRef} className="relative aspect-[4/3] w-full overflow-hidden rounded-ui-lg bg-ui-chrome">
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
            className="pointer-events-none absolute inset-x-[8%] inset-y-[20%] rounded-ui-md border-2 border-ui-brand shadow-[0_0_0_200vmax_var(--color-ui-scrim)]"
          >
            {status === "live" ? (
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-ui-brand animate-ui-pulse motion-reduce:animate-none" />
            ) : null}
          </div>
          {status === "starting" ? (
            <div className="absolute inset-0 grid place-items-center">
              {/* Hi-vis stays light on the dark camera in both themes (brand-text darkens outdoors). */}
              <SpinnerGap
                aria-hidden="true"
                weight="bold"
                className="animate-spin text-[2.25rem] text-ui-hivis motion-reduce:animate-spin-calm"
              />
            </div>
          ) : null}
          {status === "paused" ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <Button icon={<Camera weight="bold" />} onClick={onRetry}>
                Start the camera
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-ui-lg border border-ui-line bg-ui-surface-2 p-5 text-center">
          <IconTile icon={<CameraSlash weight="duotone" />} tone="warn" size="lg" />
          {/* An alert, so a screen reader says why the camera stopped. */}
          <p role="alert" className="mt-3 text-ui-base text-ui-text">
            {problem}
          </p>
          {status !== "unavailable" ? (
            <Button fullWidth icon={<ArrowCounterClockwise weight="bold" />} onClick={onRetry} className="mt-4">
              Try again
            </Button>
          ) : null}
        </div>
      )}

      {problem === null ? (
        <p role="status" aria-live="polite" className="mt-3 min-h-[1.625rem] text-center text-ui-base text-ui-text">
          {cameraMessage(status, hint)}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <Button
          variant="secondary"
          fullWidth
          icon={<Camera weight="bold" />}
          onClick={onTakePhoto}
          data-testid="barcode-take-photo"
        >
          Take a photo of the barcode
        </Button>
        <Button
          variant="secondary"
          fullWidth
          icon={<Keyboard weight="bold" />}
          onClick={onTypeNumber}
          data-testid="barcode-type-number"
        >
          Type the number instead
        </Button>
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
      <p className="mt-1 text-ui-base text-ui-muted">It&apos;s printed under the barcode lines.</p>
      <TextField
        className="mt-4"
        label="Barcode number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="search"
        spellCheck={false}
        placeholder="9 415000 000000"
        aria-invalid={error ? true : undefined}
        data-testid="barcode-number-input"
      />
      {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
      <div className="mt-5 space-y-2">
        <Button type="submit" fullWidth icon={<MagnifyingGlass weight="bold" />}>
          Look it up
        </Button>
        <Button variant="secondary" fullWidth icon={<Camera weight="bold" />} onClick={onUseCamera}>
          Use the camera
        </Button>
      </div>
    </form>
  );
}

export function BusyStep({ label }: { label: string }) {
  return (
    <div data-testid="barcode-busy-step" className="grid min-h-[16rem] place-items-center text-center" role="status">
      <div>
        <SpinnerGap
          aria-hidden="true"
          weight="bold"
          className="mx-auto animate-spin text-[2.5rem] text-ui-brand-text motion-reduce:animate-spin-calm"
        />
        <p className="mt-3 text-ui-base text-ui-text">{label}</p>
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
      {added ? (
        <StatusPill tone="ok" icon={<CheckCircle weight="fill" />}>
          Added to your quote
        </StatusPill>
      ) : (
        <StatusPill>In your library</StatusPill>
      )}
      <div className="mt-2">
        <StepHeading>{material.name}</StepHeading>
      </div>
      <p className="mt-1 text-ui-xl font-semibold text-ui-text tabular-nums" data-testid="barcode-found-price">
        {priceLabel(material, currency)}
      </p>
      <BarcodeNumber code={code} />
      {added ? (
        <Callout tone="ok" title={`Added as 1 ${material.unit || "each"}.`} className="mt-4">
          Change the quantity on the quote, then save.
        </Callout>
      ) : null}
      <div className="mt-5 space-y-2">
        {added ? (
          <>
            <Button fullWidth icon={<Camera weight="bold" />} onClick={onScanAnother}>
              Scan another
            </Button>
            <Button variant="secondary" fullWidth onClick={onDone}>
              Done
            </Button>
          </>
        ) : (
          <>
            {mode === "quote" ? (
              <Button fullWidth onClick={onAddToQuote} data-testid="barcode-add-to-quote">
                Add to quote
              </Button>
            ) : (
              <Button fullWidth onClick={onOpen} data-testid="barcode-open-material">
                Open
              </Button>
            )}
            <Button variant="secondary" fullWidth icon={<Camera weight="bold" />} onClick={onScanAnother}>
              Scan another
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** "It's already in my library": the item to save this barcode on. Exported for its render test. */
export function LibraryPicker({
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
  const matches = libraryMatches(library, query);
  return (
    <div data-testid="barcode-library-picker">
      <p className="text-ui-base text-ui-muted">Pick the item and we&apos;ll save this barcode on it.</p>
      <TextField
        className="mt-3"
        label="Search your library"
        labelHidden
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your library"
        autoComplete="off"
      />
      {matches.length === 0 ? (
        <p className="mt-3 text-ui-base text-ui-muted">
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
                className={cx(
                  "ui-focus-ring flex min-h-14 w-full items-center gap-3 rounded-ui-md border border-ui-line bg-ui-surface-2 px-4 py-2 text-left hover:border-ui-line-strong disabled:cursor-not-allowed disabled:opacity-60",
                  TAP,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui-base font-semibold text-ui-text">{m.name}</span>
                  <span className="block text-ui-sm text-ui-muted">{priceLabel(m, currency)}</span>
                </span>
                <LinkIcon aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-brand-text" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" fullWidth onClick={onBack} className="mt-3">
        Back to the new product
      </Button>
    </div>
  );
}

/** The unit box, drawn like the kit's TextField beside it (the kit has no select). */
function UnitSelect({ value, onChange }: { value: BarcodeUnit; onChange: (unit: BarcodeUnit) => void }) {
  const id = `unit${useId().replace(/:/g, "")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-ui-base font-semibold text-ui-text">
        Unit
      </label>
      <div className="ui-focus-within-ring relative flex min-h-14 items-center rounded-ui-md border-2 border-ui-line-strong bg-ui-surface text-ui-lg text-ui-text">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as BarcodeUnit)}
          data-testid="barcode-new-unit"
          className="ui-input-reset w-full min-w-0 cursor-pointer self-stretch py-2 pr-10 pl-4"
        >
          {BARCODE_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <CaretDown
          aria-hidden="true"
          weight="bold"
          className="pointer-events-none absolute right-3 text-[1.25rem] text-ui-muted"
        />
      </div>
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
  const [values, setValues] = useState<NewProductValues>(BLANK_NEW_PRODUCT);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = problem ?? error;

  function submit() {
    const found = newProductProblem(values);
    setProblem(found);
    if (!found) onSave(values);
  }

  return (
    <div data-testid="barcode-new-step">
      <StatusPill tone="info">New to your library</StatusPill>
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
          className="mt-4 space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Name"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            required
            maxLength={120}
            autoComplete="off"
            autoCapitalize="sentences"
            placeholder="e.g. Sikaflex 11FC grey 300ml"
            data-testid="barcode-new-name"
          />
          <div className="grid grid-cols-2 gap-3">
            <UnitSelect value={values.unit} onChange={(unit) => setValues({ ...values, unit })} />
            <TextField
              label="Price ex GST"
              value={values.price}
              onChange={(e) => setValues({ ...values, price: e.target.value })}
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              data-testid="barcode-new-price"
            />
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-ui-base text-ui-text">
            <input
              type="checkbox"
              checked={values.priceIncludesGst}
              onChange={(e) => setValues({ ...values, priceIncludesGst: e.target.checked })}
              className="ui-focus-ring h-6 w-6 shrink-0 cursor-pointer accent-ui-brand"
            />
            This price includes GST (we&apos;ll save it without)
          </label>

          {shown ? <ErrorNote>{shown}</ErrorNote> : null}
          {conflict?.kind === "name" && !problem ? (
            <Button
              variant="secondary"
              fullWidth
              icon={<LinkIcon weight="bold" />}
              onClick={() => onAttach(conflict)}
              disabled={saving}
              data-testid="barcode-attach-conflict"
            >
              Add barcode to {conflict.name}
            </Button>
          ) : null}

          <div className="space-y-2 pt-1">
            <Button type="submit" fullWidth loading={saving} loadingLabel="Saving…" data-testid="barcode-new-save">
              {mode === "quote" ? "Save and add to quote" : "Save to my library"}
            </Button>
            {library.length > 0 ? (
              <Button
                variant="secondary"
                fullWidth
                icon={<LinkIcon weight="bold" />}
                onClick={() => setPicking(true)}
                disabled={saving}
              >
                It&apos;s already in my library
              </Button>
            ) : null}
            <Button
              variant="secondary"
              fullWidth
              icon={<Camera weight="bold" />}
              onClick={onScanAnother}
              disabled={saving}
            >
              Scan something else
            </Button>
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
  return (
    <div data-testid="barcode-saved-step">
      {/* Two pills rather than one long one: a pill never wraps. */}
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="ok" icon={<CheckCircle weight="fill" />}>
          {attached ? "Barcode saved" : "Saved to your library"}
        </StatusPill>
        {mode === "quote" ? <StatusPill tone="ok">Added to your quote</StatusPill> : null}
      </div>
      <div className="mt-2">
        <StepHeading>{material.name}</StepHeading>
      </div>
      <p className="mt-1 text-ui-xl font-semibold text-ui-text tabular-nums">{priceLabel(material, currency)}</p>
      <p className="mt-3 text-ui-base text-ui-muted">
        {replaced ? "Its old barcode was replaced. " : ""}
        Next time you scan it, it comes straight up.
        {mode === "quote" ? " Change the quantity on the quote, then save." : ""}
      </p>
      <div className="mt-5 space-y-2">
        <Button fullWidth icon={<Camera weight="bold" />} onClick={onScanAnother}>
          Scan another
        </Button>
        {mode === "library" ? (
          <Button variant="secondary" fullWidth onClick={onOpen}>
            Open
          </Button>
        ) : null}
        <Button variant="secondary" fullWidth onClick={onDone}>
          Done
        </Button>
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
      <ErrorNote className="mt-4">{message}</ErrorNote>
      <div className="mt-5 space-y-2">
        <Button fullWidth icon={<ArrowCounterClockwise weight="bold" />} onClick={onRetry}>
          {retryLabel}
        </Button>
        <Button variant="secondary" fullWidth icon={<Keyboard weight="bold" />} onClick={onTypeNumber}>
          Type the number instead
        </Button>
      </div>
    </div>
  );
}
