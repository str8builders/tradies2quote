import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { PRICES_PATH } from "@/app/app/_v2/lib/app-nav";
import type { CaptureFormProps } from "../_components/CaptureForm";
import { CopyPrice } from "./CopyPrice";

export const CAPTURE_INTRO =
  "Paste a product link from Mitre 10, Bunnings, ITM or PlaceMakers, check the price and save it. Your quotes use it instead of an estimate.";

/**
 * /app/materials/capture in the new look: the page title with a way back to
 * Prices (the /app shell pads the notch), then the form. A product shared to
 * the app arrives filled in, as before.
 */
export function CaptureScreen(props: CaptureFormProps) {
  return (
    <Screen data-testid="capture-screen">
      <TopBar title="Copy a supplier's price" back={{ href: PRICES_PATH, label: "Prices" }} safeArea={false} />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
        <p className="text-ui-base text-ui-muted">{CAPTURE_INTRO}</p>
        <CopyPrice {...props} />
      </div>
    </Screen>
  );
}
