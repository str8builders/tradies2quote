import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { PRICES_PATH } from "@/app/app/_v2/lib/app-nav";
import { SupplierShop } from "./SupplierShop";

export const SUPPLIERS_INTRO =
  "Find a product on a supplier's website and bring its link back here. We read the name and price for you.";

/**
 * /app/suppliers in the new look: the page title with a way back to Prices
 * (the /app shell pads the notch), then the supplier websites and the read.
 */
export function SuppliersScreen({
  initialUrl,
  taxRate,
  taxLabel,
}: {
  initialUrl: string;
  /** The tradie's own tax rate as a fraction (0.15 = 15%), never a fixed 15%. */
  taxRate?: number;
  /** "GST", "VAT", "Tax" — whatever the rest of the app calls it for this tradie's country. */
  taxLabel?: string;
}) {
  return (
    <Screen data-testid="suppliers-screen">
      <TopBar title="Shop supplier websites" back={{ href: PRICES_PATH, label: "Prices" }} safeArea={false} />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
        <p className="text-ui-base text-ui-muted">{SUPPLIERS_INTRO}</p>
        <SupplierShop initialUrl={initialUrl} taxRate={taxRate} taxLabel={taxLabel} />
      </div>
    </Screen>
  );
}
