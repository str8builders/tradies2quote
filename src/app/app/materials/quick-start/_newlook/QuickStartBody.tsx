import { SectionTitle } from "@/components/ui/section-title";
import { QuickStartPrices } from "./QuickStartPrices";

export const QUICK_START_INTRO =
  "Every price you put in is one less line T2Q has to estimate. Skip what you don't buy: only filled-in prices are saved, and you can change them any time in Prices.";

/**
 * /app/materials/quick-start in the new look, under the top bar that
 * <AppHeader> gives it ("Quick start", back to Prices).
 */
export function QuickStartBody({ currency }: { currency: string }) {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10" data-testid="quick-start-body">
      <SectionTitle as="h2" description={QUICK_START_INTRO}>
        The materials you use every week
      </SectionTitle>
      <QuickStartPrices currency={currency} />
    </div>
  );
}
