import { Info } from "@phosphor-icons/react/dist/ssr";
import { gstBasisNote } from "@/lib/materials/scanReview";

/**
 * Visible note on the scan review screen when the scan couldn't tell whether
 * the printed prices include GST. Renders nothing when the scan read it.
 * `look="new"` draws the same note in ui- tokens (the new-look scan).
 */
export function ScanGstNote({
  detected,
  inclusive,
  taxLabel = "GST",
  look = "old",
}: {
  detected: boolean | null;
  inclusive: boolean;
  /** The tradie's own tax label ("GST", "VAT", "Tax"). */
  taxLabel?: string;
  look?: "old" | "new";
}) {
  const note = gstBasisNote(detected, inclusive, taxLabel);
  if (!note) return null;
  if (look === "new") {
    return (
      <p
        role="status"
        data-testid="quote-import-gst-unknown"
        className="flex items-start gap-2 rounded-ui-md bg-ui-warn-soft px-3 py-2 text-ui-sm text-ui-text"
      >
        <Info aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-[1.125rem] text-ui-warn" />
        <span>{note}</span>
      </p>
    );
  }
  return (
    <p
      role="status"
      data-testid="quote-import-gst-unknown"
      className="mt-2 flex items-start gap-1.5 rounded-sm border border-hivis/40 bg-hivis/10 px-2.5 py-1.5 text-xs text-hivis"
    >
      <Info size={13} weight="fill" className="mt-0.5 shrink-0" />
      <span>{note}</span>
    </p>
  );
}
