import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { PRICES_PATH } from "@/app/app/_v2/lib/app-nav";
import { ScanQuote } from "./ScanQuote";

/**
 * /app/materials/import-quote in the new look: the page title with a way
 * back to Prices (the /app shell pads the notch), then the scan itself.
 */
export function ScanQuoteScreen(props: {
  currency: string;
  /** Fraction, e.g. 0.15. */
  taxRate: number;
  taxLabel: string;
  needsAiConsent: boolean;
}) {
  return (
    <Screen data-testid="scan-quote-screen">
      <TopBar title="Scan a supplier quote" back={{ href: PRICES_PATH, label: "Prices" }} safeArea={false} />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
        <ScanQuote {...props} />
      </div>
    </Screen>
  );
}
