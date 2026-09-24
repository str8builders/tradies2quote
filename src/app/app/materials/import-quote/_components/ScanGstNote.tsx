import { Info } from "@phosphor-icons/react/dist/ssr";
import { gstBasisNote } from "@/lib/materials/scanReview";

/**
 * Visible note on the scan review screen when the scan couldn't tell whether
 * the printed prices include GST. Renders nothing when the scan read it.
 */
export function ScanGstNote({
  detected,
  inclusive,
}: {
  detected: boolean | null;
  inclusive: boolean;
}) {
  const note = gstBasisNote(detected, inclusive);
  if (!note) return null;
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
