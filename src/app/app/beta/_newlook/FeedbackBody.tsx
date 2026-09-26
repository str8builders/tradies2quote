import { Check } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { PRE_SEND_CHECKS } from "../_lib/checks";
import { FeedbackForm } from "./FeedbackForm";

/**
 * /app/beta in the new look. Its top bar (from <AppHeader>) and the More
 * menu call it "Send feedback", so the page leads with the feedback form;
 * the pre-send checklist the page has always had follows it, as its own
 * section rather than a second page title.
 */
export function FeedbackBody() {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10" data-testid="feedback-body">
      <FeedbackForm />

      <Card as="section" padding="lg" className="space-y-4" aria-labelledby="pre-send-title" data-testid="pre-send-checklist">
        <SectionTitle
          id="pre-send-title"
          description="T2Q does the heavy lifting, but you're the final check on every quote. The app flags and blocks the risky stuff; you make the call."
        >
          Before you send a quote
        </SectionTitle>
        <ul className="space-y-3" aria-label="Pre-send checklist">
          {PRE_SEND_CHECKS.map((check) => (
            <li key={check} className="flex items-start gap-3 text-ui-text">
              <Check aria-hidden="true" weight="bold" className="mt-1 shrink-0 text-[1.25rem] text-ui-ok" />
              <span>{check}</span>
            </li>
          ))}
        </ul>
        <p className="text-ui-sm text-ui-muted">If something&apos;s off, fix it in the quote first. If the app got it wrong, tell us.</p>
      </Card>
    </div>
  );
}
