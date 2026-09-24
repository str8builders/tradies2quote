import { Screen } from "@/components/ui/screen";
import { StatusRail } from "@/components/ui/status-rail";
import { QuoteGenerator } from "../_components/QuoteGenerator";
import { JobTopBar } from "./parts/JobTopBar";
import { jobView } from "./job-view";

/**
 * A quote that hasn't been written yet: the new-look frame around the
 * existing generator, which writes the quote and refreshes the page.
 */
export function GeneratingScreen({ quoteId, quoteNumber }: { quoteId: string; quoteNumber: string }) {
  const view = jobView({ status: "draft", generated: false, clientFirstName: null, pastExpiry: false, invoice: null });
  return (
    <Screen height="fill" data-job-screen="">
      <JobTopBar title="New quote" subtitle={`Quote ${quoteNumber}`} />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 pt-5 pb-8">
        <div className="space-y-3">
          <StatusRail position={view.position} />
          <p className="text-ui-base text-ui-muted">{view.hint}</p>
        </div>
        <QuoteGenerator id={quoteId} />
      </div>
    </Screen>
  );
}
