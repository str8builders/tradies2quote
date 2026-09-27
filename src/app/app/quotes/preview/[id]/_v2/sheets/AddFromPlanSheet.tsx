"use client";

import { useId, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { ArrowCounterClockwise, Camera, ImageSquare, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { AiConsentModal } from "@/app/app/quotes/new/_components/AiConsentModal";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { TextField } from "@/components/ui/text-field";
import type { PhotoPlanItem, PhotoPlanResult } from "@/lib/agents/photo-plan";
import { SCAN_IMAGE_ACCEPT } from "@/lib/imageUpload";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";
import { photoPlanNotes, photoPlanPatch, type PhotoPlanPatch } from "@/lib/photoPlanLines";
import type { LibraryMaterial, QuoteData } from "@/lib/quote-types";
import { usePhotoPlan } from "../../_components/PhotoPlanPanel";
import { saveErrorMessage } from "../lines";

/* ── Steps and words (pure) ───────────────────────────────────────────── */

export type AddFromPlanStep = "consent" | "pick" | "reading" | "results" | "nothing" | "error" | "locked";

/** Where the sheet is up to. A locked quote wins: nothing can be added to it. */
export function addFromPlanStep(state: {
  locked: boolean;
  /** The iPhone app is asking for AI consent before the photo goes. */
  consent: boolean;
  reading: boolean;
  result: PhotoPlanResult | null;
  error: string | null;
}): AddFromPlanStep {
  if (state.locked) return "locked";
  if (state.consent) return "consent";
  if (state.reading) return "reading";
  if (state.result) {
    return state.result.items.length + photoPlanNotes(state.result).length > 0 ? "results" : "nothing";
  }
  return state.error ? "error" : "pick";
}

function counted(items: number, notes: number): string {
  const parts: string[] = [];
  if (items > 0) parts.push(`${items} ${items === 1 ? "item" : "items"}`);
  if (notes > 0) parts.push(`${notes} ${notes === 1 ? "note" : "notes"}`);
  return parts.join(" and ");
}

/** The one add button: what the ticks add. */
export function addButtonLabel(items: number, notes: number): string {
  return items + notes > 0 ? `Add ${counted(items, notes)}` : "Tick what to add";
}

/** The page's toast once the patch is saved: what it added to the quote as it was. */
export function planAddedMessage(before: PhotoPlanPatch, after: PhotoPlanPatch): string {
  const items = Math.max(0, after.line_items.length - before.line_items.length);
  const notes = Math.max(0, after.notes.length - (Array.isArray(before.notes) ? before.notes.length : 0));
  const what = counted(items, notes);
  return what ? `Added ${what}` : "Nothing added";
}

/** Under an item: where it is in the photo, and whether the reader was unsure of it. */
export function itemDetail(item: PhotoPlanItem): string | undefined {
  const where = item.location?.trim() ?? "";
  const parts = [
    where ? `${where.charAt(0).toUpperCase()}${where.slice(1)}` : "",
    item.confidence < 0.5 ? "Not sure about this one" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/* ── The view ─────────────────────────────────────────────────────────── */

export interface AddFromPlanSheetViewProps {
  step: AddFromPlanStep;
  /** The photo being read, or read. */
  previewUrl: string | null;
  /** What to look out for, sent with the photo. */
  hint: string;
  /** What the photo was read as (results and nothing-found). */
  result: PhotoPlanResult | null;
  /** Ticks, by position in the result's items and in photoPlanNotes(result). */
  pickedItems: readonly boolean[];
  pickedNotes: readonly boolean[];
  /** Why the photo wasn't read. */
  error: string | null;
  /** The read failed with the photo still here, so it can go again. */
  canRetry: boolean;
  /** The picked lines and notes are saving. */
  adding: boolean;
  /** They're in (the page normally closes the sheet first). */
  added: boolean;
  /** Why they didn't save. */
  addError: string | null;
  cameraRef?: RefObject<HTMLInputElement | null>;
  libraryRef?: RefObject<HTMLInputElement | null>;
  onPhoto: (file: File) => void;
  onHint: (hint: string) => void;
  onRetry: () => void;
  onOtherPhoto: () => void;
  onPickItem: (index: number, picked: boolean) => void;
  onPickNote: (index: number, picked: boolean) => void;
  onAdd: () => void;
  onConsentGranted: () => void;
  onClose: () => void;
}

/**
 * "Add from a plan photo" as it looks for one step: take or pick a photo,
 * the reading, then what was found with a tick each and one add button.
 * The consent step is the shared consent sheet, shown in place of this one
 * (two open sheets would fight over focus).
 */
export function AddFromPlanSheetView(props: AddFromPlanSheetViewProps) {
  if (props.step === "consent") {
    return <AiConsentModal look="new" open onGranted={props.onConsentGranted} />;
  }
  return (
    <BottomSheet
      open
      onClose={props.onClose}
      title="Add from a plan photo"
      description="Take a photo of a plan, a sketch or the site. We list what we can see, and you pick what goes in."
      footer={footer(props)}
    >
      <PhotoInputs cameraRef={props.cameraRef} libraryRef={props.libraryRef} onPhoto={props.onPhoto} />
      <div className="space-y-5" data-testid="job-plan-photo" data-step={props.step}>
        {body(props)}
      </div>
    </BottomSheet>
  );
}

function body(props: AddFromPlanSheetViewProps): ReactNode {
  switch (props.step) {
    case "locked":
      return <Callout tone="info" title="This quote has been accepted, so its lines can't change now." />;
    case "reading":
      return <Reading previewUrl={props.previewUrl} />;
    case "results":
      return <Found {...props} />;
    case "nothing":
      return (
        <>
          {props.previewUrl ? <PlanPhoto src={props.previewUrl} /> : null}
          <Seen description={props.result?.description ?? ""} />
          <Callout tone="info" title="Nothing to add from this photo">
            Try a closer photo, with the plan flat and in good light.
          </Callout>
          <HintField hint={props.hint} onHint={props.onHint} />
        </>
      );
    default:
      return <Pick {...props} />;
  }
}

function footer(props: AddFromPlanSheetViewProps): ReactNode {
  switch (props.step) {
    case "pick":
    case "error":
    case "nothing":
      return (
        <PhotoButtons
          again={props.step !== "pick" && props.previewUrl !== null}
          cameraRef={props.cameraRef}
          libraryRef={props.libraryRef}
        />
      );
    case "results": {
      const items = props.pickedItems.filter(Boolean).length;
      const notes = props.pickedNotes.filter(Boolean).length;
      return (
        <Button
          fullWidth
          data-testid="job-plan-photo-add"
          loading={props.adding}
          loadingLabel="Adding…"
          disabled={props.added || items + notes === 0}
          onClick={props.onAdd}
        >
          {props.added ? "Added" : addButtonLabel(items, notes)}
        </Button>
      );
    }
    default:
      return null;
  }
}

/** The two hidden pickers behind "Take a photo" and "Choose a photo". */
function PhotoInputs({
  cameraRef,
  libraryRef,
  onPhoto,
}: Pick<AddFromPlanSheetViewProps, "cameraRef" | "libraryRef" | "onPhoto">) {
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same photo again still counts.
    event.target.value = "";
    if (file) onPhoto(file);
  };
  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept={SCAN_IMAGE_ACCEPT}
        capture="environment"
        className="hidden"
        data-testid="job-plan-photo-camera"
        onChange={choose}
      />
      <input
        ref={libraryRef}
        type="file"
        accept={SCAN_IMAGE_ACCEPT}
        className="hidden"
        data-testid="job-plan-photo-library"
        onChange={choose}
      />
    </>
  );
}

function PhotoButtons({
  again,
  cameraRef,
  libraryRef,
}: {
  again: boolean;
  cameraRef?: RefObject<HTMLInputElement | null>;
  libraryRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="grid gap-3">
      <Button
        fullWidth
        icon={<Camera weight="bold" />}
        onClick={() => cameraRef?.current?.click()}
        data-testid="job-plan-photo-take"
      >
        {again ? "Take another photo" : "Take a photo"}
      </Button>
      <Button
        variant="secondary"
        fullWidth
        icon={<ImageSquare weight="bold" />}
        onClick={() => libraryRef?.current?.click()}
        data-testid="job-plan-photo-choose"
      >
        {again ? "Choose another photo" : "Choose a photo"}
      </Button>
    </div>
  );
}

/** Before the photo (and after one that couldn't be read): the optional note and the error. */
function Pick({ step, previewUrl, hint, error, canRetry, onHint, onRetry }: AddFromPlanSheetViewProps) {
  return (
    <>
      {step === "error" && error ? (
        <>
          {previewUrl ? <PlanPhoto src={previewUrl} dim /> : null}
          <div role="alert">
            <Callout
              tone="bad"
              title={error}
              action={
                canRetry ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    icon={<ArrowCounterClockwise weight="bold" />}
                    onClick={onRetry}
                    data-testid="job-plan-photo-retry"
                  >
                    Try again
                  </Button>
                ) : undefined
              }
            />
          </div>
        </>
      ) : null}
      <HintField hint={hint} onHint={onHint} />
      <p className="text-ui-sm text-ui-muted">
        JPEG, PNG, WebP, GIF or iPhone HEIC photos. We only give a size when the photo shows one.
      </p>
    </>
  );
}

/** The classic panel's optional note, sent with the next photo. */
function HintField({ hint, onHint }: Pick<AddFromPlanSheetViewProps, "hint" | "onHint">) {
  return (
    <TextField
      label={
        <>
          Anything we should look out for? <span className="font-normal text-ui-muted">(optional)</span>
        </>
      }
      value={hint}
      onChange={(event) => onHint(event.target.value)}
      maxLength={500}
      placeholder="e.g. Bathroom wall, may have water damage behind the GIB"
      data-testid="job-plan-photo-hint"
    />
  );
}

function Reading({ previewUrl }: { previewUrl: string | null }) {
  return (
    <div role="status" data-testid="job-plan-photo-reading" className="flex flex-col items-center gap-4 text-center">
      {previewUrl ? <PlanPhoto src={previewUrl} dim /> : null}
      <SpinnerGap
        aria-hidden="true"
        weight="bold"
        className="animate-spin text-[2.5rem] text-ui-brand-text motion-reduce:animate-spin-calm"
      />
      <div>
        <p className="text-ui-lg font-semibold text-ui-text">Reading your photo…</p>
        <p className="mt-1 text-ui-sm text-ui-muted">It can take up to a minute.</p>
      </div>
    </div>
  );
}

/** What was found: the description, then the items and the notes, each with a tick. */
function Found(props: AddFromPlanSheetViewProps) {
  const { result, previewUrl, pickedItems, pickedNotes, adding, added, addError } = props;
  if (!result) return null;
  const notes = photoPlanNotes(result);
  const busy = adding || added;
  return (
    <>
      {previewUrl ? <PlanPhoto src={previewUrl} /> : null}
      <Seen description={result.description} />
      {result.items.length > 0 ? (
        <section aria-labelledby="job-plan-photo-items" className="space-y-2">
          <h3 id="job-plan-photo-items" className="font-semibold text-ui-text">
            Items
          </h3>
          <Card padding="none">
            <ul className="divide-y divide-ui-line">
              {result.items.map((item, i) => (
                <li key={`${i}-${item.label}`}>
                  <TickRow
                    checked={pickedItems[i] ?? false}
                    onChange={(on) => props.onPickItem(i, on)}
                    label={item.label}
                    detail={itemDetail(item)}
                    strong
                    disabled={busy}
                    testId="job-plan-photo-item"
                  />
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-ui-sm text-ui-muted">
            Each goes in as 1, with no price unless it&apos;s in your price list. Check them before you send.
          </p>
        </section>
      ) : null}
      {notes.length > 0 ? (
        <section aria-labelledby="job-plan-photo-notes" className="space-y-2">
          <h3 id="job-plan-photo-notes" className="font-semibold text-ui-text">
            Notes
          </h3>
          <Card padding="none">
            <ul className="divide-y divide-ui-line">
              {notes.map((note, i) => (
                <li key={`${i}-${note.text}`}>
                  <TickRow
                    checked={pickedNotes[i] ?? false}
                    onChange={(on) => props.onPickNote(i, on)}
                    label={note.text}
                    detail={note.kind === "check" ? "Check on site" : "Draft note for the quote"}
                    disabled={busy}
                    testId="job-plan-photo-note"
                  />
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-ui-sm text-ui-muted">They go under Things to check in More tools.</p>
        </section>
      ) : null}
      <div aria-live="polite">
        {addError ? (
          <div role="alert">
            <Callout tone="bad" title={addError} />
          </div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        fullWidth
        icon={<ArrowCounterClockwise weight="bold" />}
        onClick={props.onOtherPhoto}
        disabled={adding}
        data-testid="job-plan-photo-other"
      >
        Use a different photo
      </Button>
    </>
  );
}

function Seen({ description }: { description: string }) {
  if (!description.trim()) return null;
  return (
    <section aria-labelledby="job-plan-photo-seen" className="space-y-1">
      <h3 id="job-plan-photo-seen" className="font-semibold text-ui-text">
        What we see
      </h3>
      <p className="text-ui-text">{description}</p>
    </section>
  );
}

/** A real tick box in a row at least 56 px tall; the whole row is the tap target. */
function TickRow({
  checked,
  onChange,
  label,
  detail,
  strong = false,
  disabled = false,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  detail?: string;
  strong?: boolean;
  disabled?: boolean;
  testId: string;
}) {
  const detailId = `tick${useId().replace(/:/g, "")}`;
  return (
    <label
      className={cx(
        "flex min-h-14 items-start gap-3 px-4 py-3 text-ui-base",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={detail ? detailId : undefined}
        data-testid={testId}
        className="ui-focus-ring mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-ui-brand disabled:cursor-not-allowed"
      />
      <span className="min-w-0 flex-1">
        <span className={cx("block break-words whitespace-pre-line text-ui-text", strong && "font-semibold")}>{label}</span>
        {detail ? (
          <span id={detailId} className="mt-0.5 block text-ui-sm text-ui-muted">
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** The photo, as big as the sheet sensibly allows; dimmed while it's being read. */
function PlanPhoto({ src, dim = false }: { src: string; dim?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Your photo"
      className={cx("mx-auto block max-h-48 w-auto rounded-ui-md border border-ui-line", dim && "opacity-70")}
    />
  );
}

/* ── The sheet ────────────────────────────────────────────────────────── */

export interface AddFromPlanSheetProps {
  /** The quote as the page shows it: what's picked goes after its own lines and notes. */
  data: QuoteData;
  /** Saves the new lines and notes: exactly what the classic editor writes (lib/photoPlanLines). */
  onApply: (patch: Pick<QuoteData, "line_items" | "notes">) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
  /** Accepted or later: nothing can be added. */
  locked?: boolean;
  /** The tradie's library, for the classic editor's price match. Without it every line waits for a price. */
  library?: LibraryMaterial[];
  /** The iPhone app with no AI consent on record: ask before the first photo goes (App Store 5.1.2(i)). */
  needsAiConsent?: boolean;
}

const NO_LIBRARY: LibraryMaterial[] = [];

/** The ticks and the add, for one answer: a new read starts again, everything ticked. */
interface Picks {
  of: PhotoPlanResult | null;
  offItems: number[];
  offNotes: number[];
  adding: boolean;
  added: boolean;
  error: string | null;
}

const freshPicks = (of: PhotoPlanResult | null): Picks => ({
  of,
  offItems: [],
  offNotes: [],
  adding: false,
  added: false,
  error: null,
});

/**
 * Add items and notes from a photo of a plan without leaving the job: the
 * classic editor's "Photo / plan" panel in the new look. The photo is read
 * by usePhotoPlan (the classic panel's own logic); in the iPhone app the
 * consent step comes before anything is sent, as in the supplier scanner.
 */
export function AddFromPlanSheet({
  data,
  onApply,
  onClose,
  locked = false,
  library = NO_LIBRARY,
  needsAiConsent = false,
}: AddFromPlanSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const consentGiven = useRef<((granted: boolean) => void) | null>(null);
  const plan = usePhotoPlan({
    needed: needsAiConsent,
    // Resolves on "I agree"; "Not now" leaves for Home, as everywhere else.
    ask: () =>
      new Promise<boolean>((resolve) => {
        consentGiven.current = resolve;
        setConsentOpen(true);
      }),
  });

  const result = plan.result;
  const notes = result ? photoPlanNotes(result) : [];
  const [stored, setStored] = useState<Picks>(() => freshPicks(null));
  const picks = stored.of === result ? stored : freshPicks(result);
  const pickedItems = (result?.items ?? []).map((_, i) => !picks.offItems.includes(i));
  const pickedNotes = notes.map((_, i) => !picks.offNotes.includes(i));

  function change(next: (current: Picks) => Partial<Picks>) {
    setStored((prev) => {
      const current = prev.of === result ? prev : freshPicks(result);
      return { ...current, ...next(current) };
    });
  }

  function tick(key: "offItems" | "offNotes", index: number, on: boolean) {
    change((current) => {
      const off = current[key].filter((i) => i !== index);
      return { [key]: on ? off : [...off, index] };
    });
  }

  async function add() {
    if (!result || locked || picks.adding || picks.added) return;
    const items = result.items.filter((_, i) => pickedItems[i]);
    const picked = notes.filter((_, i) => pickedNotes[i]).map((note) => note.text);
    if (items.length + picked.length === 0) return;
    change(() => ({ adding: true, error: null }));
    let outcome: { ok: true } | { error: string };
    try {
      outcome = await onApply(photoPlanPatch(data, { items, notes: picked }, library));
    } catch {
      outcome = { error: saveErrorMessage("network", QUOTE_LOCKED_MESSAGE) };
    }
    const done: Partial<Picks> = "error" in outcome ? { adding: false, error: outcome.error } : { adding: false, added: true };
    change(() => done);
  }

  return (
    <AddFromPlanSheetView
      step={addFromPlanStep({ locked, consent: consentOpen, reading: plan.submitting, result, error: plan.error })}
      previewUrl={plan.previewUrl}
      hint={plan.hint}
      result={result}
      pickedItems={pickedItems}
      pickedNotes={pickedNotes}
      error={plan.error}
      canRetry={plan.file !== null}
      adding={picks.adding}
      added={picks.added}
      addError={picks.error}
      cameraRef={cameraRef}
      libraryRef={libraryRef}
      onPhoto={(file) => {
        const picked = plan.pickFile(file);
        if (picked) void plan.read(picked);
      }}
      onHint={plan.setHint}
      onRetry={() => void plan.read()}
      onOtherPhoto={() => plan.pickFile(null)}
      onPickItem={(i, on) => tick("offItems", i, on)}
      onPickNote={(i, on) => tick("offNotes", i, on)}
      onAdd={() => void add()}
      onConsentGranted={() => {
        setConsentOpen(false);
        consentGiven.current?.(true);
        consentGiven.current = null;
      }}
      onClose={onClose}
    />
  );
}
