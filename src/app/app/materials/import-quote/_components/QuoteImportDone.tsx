import Link from "next/link";
import { Camera, CheckCircle, Warning, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import type { MergedName, SaveOutcome } from "@/lib/materials/libraryImport";

/**
 * After "Add to library" on a scanned supplier quote. Says exactly what
 * happened: all saved, some saved (and which weren't), or nothing saved —
 * which is an error with a way back to the lines, never "Added".
 */
export function QuoteImportDone({
  outcome,
  merged = [],
  onScanAnother,
  onBack,
}: {
  outcome: SaveOutcome;
  merged?: MergedName[];
  onScanAnother: () => void;
  onBack: () => void;
}) {
  const Icon = outcome.tone === "ok" ? CheckCircle : outcome.tone === "partial" ? Warning : WarningOctagon;
  const colour = outcome.tone === "ok" ? "text-brand" : outcome.tone === "partial" ? "text-hivis" : "text-red-300";
  return (
    <section
      className="t2q-card-pro mt-6 p-5 sm:p-6"
      data-testid="quote-import-done"
      data-tone={outcome.tone}
      role={outcome.tone === "bad" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <Icon size={24} weight="fill" className={`mt-0.5 shrink-0 ${colour}`} />
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight text-white">{outcome.title}.</h2>
          <p className="mt-1 text-sm text-ink-300">{outcome.detail}</p>
          {outcome.tone !== "bad" ? (
            <p className="mt-1 text-sm text-ink-300">
              These prices are marked as scanned estimates — confirm them with the supplier before relying on them.
            </p>
          ) : null}
          {merged.length > 0 ? (
            <p className="mt-2 text-xs text-ink-400" data-testid="quote-import-done-merged">
              Saved once each (they were on more than one line): {merged.map((m) => `“${m.name}”`).join(", ")}.
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {outcome.tone === "bad" ? (
          <button type="button" onClick={onBack} className="t2q-btn-primary-pro inline-flex h-11 px-5" data-testid="quote-import-done-back">
            Back to the lines
          </button>
        ) : (
          <Link href="/app/materials" className="t2q-btn-primary-pro inline-flex h-11 px-5">
            View library
          </Link>
        )}
        <button type="button" onClick={onScanAnother} className="t2q-btn-ghost-pro inline-flex h-11 px-5">
          <Camera size={18} weight="bold" />
          Scan another
        </button>
      </div>
    </section>
  );
}
