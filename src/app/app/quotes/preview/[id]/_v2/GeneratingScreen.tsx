import { Screen } from "@/components/ui/screen";
import { StatusRail } from "@/components/ui/status-rail";
import { GeneratingPanel } from "./parts/GeneratingPanel";
import { JobTopBar } from "./parts/JobTopBar";
import { jobView } from "./job-view";

/**
 * A quote that hasn't been written yet: the new-look frame around the
 * generator. The panel runs the classic generator's logic (it writes the
 * quote and refreshes the page) with its own kit markup.
 */
export function GeneratingScreen({ quoteId, quoteNumber }: { quoteId: string; quoteNumber: string }) {
  const view = jobView({ status: "draft", generated: false, clientFirstName: null, pastExpiry: false, invoice: null });
  return (
    <Screen height="fill" data-job-screen="">
      <JobTopBar title="New quote" subtitle={`Quote ${quoteNumber}`} />
      <div className="group/generating mx-auto w-full max-w-xl flex-1 space-y-5 px-4 pt-5 pb-8">
        <div className="space-y-3">
          <StatusRail position={view.position} />
          {/* "Writing your quote…" would contradict the panel once a try fails. */}
          <p className="text-ui-base text-ui-muted group-has-[[data-state=failed]]/generating:hidden">{view.hint}</p>
        </div>
        <GeneratingPanel quoteId={quoteId} />
      </div>
    </Screen>
  );
}
