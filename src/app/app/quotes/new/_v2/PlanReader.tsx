"use client";

import {
  ArrowCounterClockwise,
  ArrowRight,
  Camera,
  PencilSimple,
  Receipt,
  SpinnerGap,
  UploadSimple,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import { StatusPill } from "@/components/ui/status-pill";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import { TextField } from "@/components/ui/text-field";
import { FloorPlanSvg } from "@/lib/floorPlanSvg";
import {
  JOB_TYPES,
  SCAN_SLOW_NOTICE,
  ScanFileInputs,
  TIMBER_LENGTH_DEFAULT,
  TIMBER_LENGTH_MAX,
  TIMBER_LENGTH_MIN,
  useScanPanel,
  type JobType,
  type ScanPanelModel,
  type ScanResult,
  type ScanState,
} from "../_components/ScanPanel";
import { TextBox } from "./parts";

export interface PlanReaderProps {
  /** The takeoff words: empty until the sizes are checked. */
  transcript: string;
  setTranscript: (text: string) => void;
}

/**
 * The plan reader in the new look: ScanPanel's steps and logic
 * (useScanPanel), drawn with the kit so it reads in dark and outdoor mode.
 * Snap the plan, check the sizes, check the takeoff; a supplier quote is
 * sent to the quote importer. Test ids, labels and roles match ScanPanel's.
 */
export function PlanReader({ transcript, setTranscript }: PlanReaderProps) {
  const scan = useScanPanel(setTranscript);
  return <PlanReaderView scan={scan} transcript={transcript} setTranscript={setTranscript} />;
}

export interface PlanReaderViewProps extends PlanReaderProps {
  scan: ScanPanelModel;
}

/** The plan reader as it looks for a given state (no browser work here). */
export function PlanReaderView({ scan, transcript, setTranscript }: PlanReaderViewProps) {
  const { state, scanResult } = scan;
  return (
    <section
      id="panel-scan"
      role="tabpanel"
      aria-labelledby="tab-scan"
      data-testid="panel-scan"
      className={cx("flex flex-col gap-5", UI_TEXT)}
    >
      <ScanFileInputs
        fileInputRef={scan.fileInputRef}
        cameraInputRef={scan.cameraInputRef}
        onFileChange={scan.onFileChange}
      />
      {state === "wrong-doc" && scanResult ? (
        <WrongDocument
          previewUrl={scan.previewUrl}
          onContinueAnyway={() => scan.setState("review-dims")}
          onRedo={scan.fullReset}
        />
      ) : state === "transcript" && scanResult ? (
        <CheckTakeoff scan={scan} result={scanResult} transcript={transcript} setTranscript={setTranscript} />
      ) : state === "review-dims" && scanResult ? (
        <CheckSizes scan={scan} result={scanResult} />
      ) : (
        <Setup scan={scan} />
      )}
    </section>
  );
}

/** The drawing's photo, as big as the phone allows. */
function DrawingPhoto({ src, alt, dim = false }: { src: string; alt: string; dim?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cx("max-h-56 w-auto self-center rounded-ui-md border border-ui-line", dim && "opacity-70")}
    />
  );
}

/**
 * Before the photo: the optional job type, timber length and notes, then
 * Take photo and Upload image. The line under them says what's happening
 * (it's the live region, as in ScanPanel), and turns into the error.
 */
function Setup({ scan }: { scan: ScanPanelModel }) {
  const { state } = scan;
  const reading = state === "uploading";
  return (
    <>
      <JobTypeChoice jobType={scan.jobType} onPick={scan.setJobType} disabled={reading} />
      <TextField
        id="scan-timber-length"
        data-testid="scan-timber-length"
        label="Timber lengths you buy"
        type="number"
        inputMode="decimal"
        min={TIMBER_LENGTH_MIN}
        max={TIMBER_LENGTH_MAX}
        step="0.1"
        value={scan.timberLengthInput}
        onChange={(event) => scan.setTimberLengthInput(event.target.value)}
        disabled={reading}
        suffix="m"
        hint={`Default ${TIMBER_LENGTH_DEFAULT} m. We count whole lengths and add 10% for waste.`}
      />
      <TextField
        id="scan-hint"
        data-testid="scan-hint"
        label={
          <>
            Anything else we should know? <span className="font-normal text-ui-muted">(optional)</span>
          </>
        }
        value={scan.hint}
        onChange={(event) => scan.setHint(event.target.value)}
        maxLength={500}
        disabled={reading}
        placeholder="e.g. Treated pine deck, 1.2m off ground."
      />
      <div className="flex flex-col gap-3">
        <Button
          fullWidth
          icon={<Camera weight="bold" />}
          onClick={() => scan.cameraInputRef.current?.click()}
          disabled={!scan.canScan}
          data-testid="scan-take-photo"
        >
          Take photo
        </Button>
        <Button
          variant="secondary"
          fullWidth
          icon={<UploadSimple weight="bold" />}
          onClick={() => scan.fileInputRef.current?.click()}
          disabled={!scan.canScan}
          data-testid="scan-upload"
        >
          Upload image
        </Button>
      </div>
      {reading ? (
        <Card className="flex flex-col items-center gap-4">
          {scan.previewUrl ? <DrawingPhoto src={scan.previewUrl} alt="Drawing preview" dim /> : null}
          <div className="w-full max-w-sm">
            <TapeMeasureProgress look="new" done={scan.scanComplete} label="Reading your drawing" />
          </div>
        </Card>
      ) : null}
      <div data-testid="scan-status" aria-live="polite">
        {state === "error" ? (
          <Callout
            tone="bad"
            title={<span data-testid="scan-error">{scan.error}</span>}
            action={
              <Button variant="secondary" onClick={scan.rescan}>
                Try again
              </Button>
            }
          />
        ) : (
          <SetupStatus state={state} slow={scan.scanSlow} />
        )}
      </div>
    </>
  );
}

function SetupStatus({ state, slow }: { state: ScanState; slow: boolean }) {
  if (state === "idle") {
    return (
      <p className="text-ui-sm text-ui-muted">
        JPEG, PNG, WebP, GIF or iPhone HEIC photos. Large phone photos are compressed before upload.
      </p>
    );
  }
  if (state === "converting") {
    return (
      <p className="flex items-center gap-2 text-ui-base text-ui-text">
        <SpinnerGap
          aria-hidden="true"
          weight="bold"
          className="shrink-0 animate-spin text-[1.25rem] text-ui-brand-text motion-reduce:animate-spin-calm"
        />
        Preparing photo…
      </p>
    );
  }
  if (state === "uploading") {
    return (
      <p className="text-center text-ui-base font-semibold text-ui-text">
        {slow ? SCAN_SLOW_NOTICE : "Reading your drawing…"}
      </p>
    );
  }
  return null;
}

/**
 * The optional job type, a nudge for the reader: six choices on the kit's
 * segmented tray. Roles, names and test ids as ScanPanel's radio group.
 */
function JobTypeChoice({
  jobType,
  onPick,
  disabled,
}: {
  jobType: JobType | "";
  onPick: (jobType: JobType) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <p id="scan-jobtype-label" className="mb-2 text-ui-base font-semibold text-ui-text">
        Job type <span className="font-normal text-ui-muted">(optional)</span>
      </p>
      <div
        role="radiogroup"
        aria-labelledby="scan-jobtype-label"
        data-testid="scan-jobtype"
        className="grid grid-cols-3 gap-1 rounded-ui-md border border-ui-line bg-ui-surface-2 p-1"
      >
        {JOB_TYPES.map((type) => {
          const picked = jobType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={picked}
              data-testid={`scan-jobtype-${type.toLowerCase()}`}
              onClick={() => onPick(type)}
              disabled={disabled}
              className={cx(
                "ui-focus-ring min-h-12 rounded-ui-sm px-2 py-2 text-ui-base font-semibold",
                TAP,
                picked
                  ? "bg-ui-bg text-ui-text shadow-ui-card ring-2 ring-ui-line-strong"
                  : "text-ui-muted hover:text-ui-text",
                disabled ? "cursor-not-allowed" : PRESS,
              )}
            >
              {type}
            </button>
          );
        })}
      </div>
      {!jobType ? (
        <p className="mt-2 text-ui-sm text-ui-muted">
          We read what&apos;s being built from the drawing. Pick one only to nudge it.
        </p>
      ) : null}
    </div>
  );
}

/**
 * What was read, to check before anything is counted: the build, its shape,
 * anything that didn't add up, the schematic and the photo, then the sizes
 * in a big box. Only these sizes reach the materials.
 */
function CheckSizes({ scan, result }: { scan: ScanPanelModel; result: ScanResult }) {
  const { plan } = result;
  const flags = plan?.review_flags ?? [];
  // The drawing decides the type; say so when the tradie picked another.
  const mismatch = scan.jobType !== "" && scan.jobType !== result.detectedType;
  return (
    <>
      {mismatch ? (
        <div data-testid="scan-type-mismatch-notice">
          <Callout
            tone="warn"
            title={`You picked ${scan.jobType}, but this drawing looks like ${result.buildType || result.detectedType}.`}
            action={
              <Button variant="secondary" onClick={scan.backToSetup}>
                Change the job type
              </Button>
            }
          >
            We&apos;ve read it as {result.detectedType} from the drawing. If that&apos;s wrong, change the job type
            and scan it again.
          </Callout>
        </div>
      ) : null}
      <div>
        <h3 className="ui-title text-ui-base text-ui-muted">Here&apos;s what I read from your drawing</h3>
        {result.buildType ? <p className="ui-title mt-1 text-ui-xl text-ui-text">{result.buildType}</p> : null}
        {plan && (plan.area_m2 != null || plan.perimeter_m != null) ? (
          <div data-testid="scan-geometry" className="mt-3 flex flex-wrap gap-2">
            {plan.shape_label ? <StatusPill tone="info">{plan.shape_label}</StatusPill> : null}
            {plan.area_m2 != null ? <StatusPill>Area {plan.area_m2} m²</StatusPill> : null}
            {plan.perimeter_m != null ? <StatusPill>Perimeter {plan.perimeter_m} m</StatusPill> : null}
          </div>
        ) : null}
      </div>
      {flags.length > 0 ? (
        <Callout tone="warn" title="Check these sizes">
          <ul data-testid="scan-review-flags" className="list-disc space-y-1 pl-5">
            {flags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
      {plan ? (
        // The schematic paints its own dark ground, so it reads on either page colour.
        <figure data-testid="floor-plan-wrapper" className="overflow-hidden rounded-ui-md border border-ui-line">
          <figcaption className="border-b border-ui-line bg-ui-surface-2 px-3 py-2 text-ui-sm text-ui-muted">
            A schematic. Measure it against your drawing.
          </figcaption>
          <FloorPlanSvg plan={plan} jobType={result.detectedType} look="new" />
        </figure>
      ) : null}
      {scan.previewUrl ? <DrawingPhoto src={scan.previewUrl} alt="Scanned drawing" /> : null}
      <TextBox
        label="Check the sizes"
        value={scan.editedDimensions}
        onChange={scan.setEditedDimensions}
        rows={10}
        testId="scan-dimensions"
        hint="Fix any number we got wrong. The materials list uses these."
      />
      <div className="flex flex-col gap-3">
        <Button
          fullWidth
          iconEnd={<ArrowRight weight="bold" />}
          onClick={scan.generateMaterials}
          disabled={scan.editedDimensions.trim().length === 0}
          data-testid="scan-generate-materials"
        >
          Use these sizes
        </Button>
        <Button
          variant="ghost"
          fullWidth
          icon={<ArrowCounterClockwise weight="bold" />}
          onClick={scan.backToSetup}
          data-testid="scan-back-to-setup"
        >
          Take a different photo
        </Button>
      </div>
    </>
  );
}

/** The takeoff the quote is written from, in a big box to fix; "Write my quote" waits below. */
function CheckTakeoff({
  scan,
  result,
  transcript,
  setTranscript,
}: {
  scan: ScanPanelModel;
  result: ScanResult;
  transcript: string;
  setTranscript: (text: string) => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ui-title text-ui-base text-ui-muted">Drawing read</h3>
          {result.buildType ? <p className="ui-title mt-1 text-ui-xl text-ui-text">{result.buildType}</p> : null}
        </div>
        <IconButton
          label="Remove drawing"
          icon={<X weight="bold" />}
          variant="secondary"
          onClick={scan.fullReset}
          data-testid="scan-clear"
        />
      </div>
      {scan.previewUrl ? <DrawingPhoto src={scan.previewUrl} alt="Scanned drawing" /> : null}
      <TextBox
        label="The takeoff: check it before we quote"
        value={transcript}
        onChange={setTranscript}
        rows={12}
        testId="scan-transcript"
        hint="Edit anything that's wrong. The quote is built from this text."
      />
      <Button
        variant="secondary"
        fullWidth
        icon={<PencilSimple weight="bold" />}
        onClick={() => scan.setState("review-dims")}
        data-testid="scan-back-to-dims"
      >
        Edit the sizes
      </Button>
    </>
  );
}

/**
 * A printed supplier quote, not a plan: the drawing takeoff would make up
 * lines over it, so the quote importer (which copies the supplier's lines and
 * prices) comes first, with the takeoff still there if they meant it.
 */
function WrongDocument({
  previewUrl,
  onContinueAnyway,
  onRedo,
}: {
  previewUrl: string | null;
  onContinueAnyway: () => void;
  onRedo: () => void;
}) {
  return (
    <div data-testid="scan-wrong-doc" className="flex flex-col gap-5">
      <Callout tone="warn">
        <h3 className="ui-title text-ui-lg text-ui-text">That looks like a supplier quote</h3>
        <p className="mt-1">
          This scanner reads hand-drawn plans. To turn a merchant quote (ITM, PlaceMakers…) into a quote that
          matches it exactly, use the quote importer. It copies the supplier&apos;s line items and prices 1:1.
        </p>
      </Callout>
      {previewUrl ? <DrawingPhoto src={previewUrl} alt="Scanned document" /> : null}
      <div className="flex flex-col gap-3">
        <ButtonLink
          href="/app/materials/import-quote"
          fullWidth
          icon={<Receipt weight="bold" />}
          data-testid="scan-wrong-doc-import"
        >
          Open quote importer
        </ButtonLink>
        <p className="text-ui-sm text-ui-muted">You&apos;ll need to take or import the photo again there.</p>
        <Button variant="secondary" fullWidth onClick={onContinueAnyway} data-testid="scan-wrong-doc-continue">
          Use as a drawing anyway
        </Button>
        <Button variant="ghost" fullWidth onClick={onRedo}>
          Scan something else
        </Button>
      </div>
    </div>
  );
}
