import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { PRICES_PATH } from "../../_v2/lib/app-nav";
import { PriceForm, type PriceFormMode, type PriceFormValues } from "./PriceForm";

export const ADD_PRICE_INTRO = "Save it once and every quote uses it. Your price replaces the T2Q estimate.";

/**
 * /app/materials/new and /app/materials/[id]/edit in the new look: a title
 * with a way back to Prices (the /app shell pads the notch), then the form.
 */
export function PriceFormScreen({ mode, initial }: { mode: PriceFormMode; initial?: PriceFormValues }) {
  return (
    <Screen data-testid="price-form-screen">
      <TopBar
        title={mode === "create" ? "Add a price" : "Change price"}
        subtitle={mode === "edit" ? initial?.name : undefined}
        back={{ href: PRICES_PATH, label: "Prices" }}
        safeArea={false}
      />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
        {mode === "create" ? <p className="text-ui-base text-ui-muted">{ADD_PRICE_INTRO}</p> : null}
        <PriceForm mode={mode} initial={initial} />
      </div>
    </Screen>
  );
}
