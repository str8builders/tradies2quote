import { Money } from "@/components/ui/money";
import { CheckRow } from "@/app/app/materials/import-quote/_newlook/parts";

/**
 * The GST tick on both new-look supplier screens (copy a supplier's price,
 * shop supplier websites). A real checkbox, as in the old look, ticked to
 * start with: most NZ supplier websites show prices with GST.
 */
export function GstTick({
  checked,
  onChange,
  testId,
  taxLabel = "GST",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
  /** "GST", "VAT", "Tax" — whatever the rest of the app calls it for this tradie's country. */
  taxLabel?: string;
}) {
  return (
    <CheckRow
      checked={checked}
      onChange={onChange}
      label={`The price includes ${taxLabel}`}
      description={`Most supplier websites show prices with ${taxLabel}. We take it off before saving. Untick if yours shows it without.`}
      testId={testId}
    />
  );
}

/** What gets saved, in words: the price without GST, and what it was with GST when the tick says so. */
export function SavePreview({
  saved,
  shown,
  includesGst,
  testId,
}: {
  saved: number;
  shown: number;
  includesGst: boolean;
  testId: string;
}) {
  return (
    <p data-testid={testId} className="rounded-ui-md bg-ui-surface-2 px-4 py-3">
      {includesGst ? (
        <>
          We&apos;ll save <Money amount={saved} className="font-semibold" /> without GST (
          <Money amount={shown} /> with it).
        </>
      ) : (
        <>
          We&apos;ll save <Money amount={saved} className="font-semibold" /> as it is, with no GST taken off.
        </>
      )}
    </p>
  );
}
