import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { PRICES_PATH } from "../../_v2/lib/app-nav";
import { PriceListImport } from "./PriceListImport";

/**
 * /app/materials/import in the new look: the page title with a way back to
 * Prices (the /app shell pads the notch), then the import itself.
 */
export function PriceImportScreen(props: {
  /** Fraction, e.g. 0.15. */
  taxRate: number;
  taxLabel: string;
  currency: string;
  needsAiConsent: boolean;
}) {
  return (
    <Screen data-testid="price-import-screen">
      <TopBar title="Import a price list" back={{ href: PRICES_PATH, label: "Prices" }} safeArea={false} />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
        <PriceListImport {...props} />
      </div>
    </Screen>
  );
}
