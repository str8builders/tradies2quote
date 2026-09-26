"use client";

import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { TextAreaField } from "../../settings/_newlook/fields";
import { FIELDS, useBetaFeedback, type BetaFeedbackState } from "../_components/BetaFeedbackForm";

/**
 * The feedback form in the new look: the same four boxes and the same save
 * action as the old form (useBetaFeedback); fill in any box, skip the rest.
 */
export function FeedbackFormView({ feedback }: { feedback: BetaFeedbackState }) {
  const { values, status, error, submit, setField, reset } = feedback;

  if (status === "sent") {
    return (
      <Card as="section" padding="lg" className="space-y-4" data-testid="beta-feedback-sent">
        <div role="status">
          <Callout tone="ok" title="Thanks, got it.">
            Every note goes straight to Challis.
          </Callout>
        </div>
        <Button variant="secondary" fullWidth onClick={reset}>
          Send another
        </Button>
      </Card>
    );
  }

  return (
    <Card as="section" padding="lg" aria-labelledby="feedback-title">
      <form data-testid="beta-feedback-form" onSubmit={submit} className="space-y-6">
        <SectionTitle
          id="feedback-title"
          description="Tell us what to fix or what's working. Fill in any box and skip the rest. It goes straight to the builder who made this."
        >
          Tell us what you think
        </SectionTitle>
        {FIELDS.map((field) => (
          <TextAreaField
            key={field.key}
            label={field.label}
            name={field.key}
            rows={2}
            placeholder={field.placeholder}
            value={values[field.key]}
            onChange={(event) => setField(field.key, event.target.value)}
          />
        ))}
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
        <Button
          type="submit"
          fullWidth
          loading={status === "sending"}
          loadingLabel="Sending…"
          icon={<PaperPlaneTilt weight="fill" />}
        >
          Send feedback
        </Button>
      </form>
    </Card>
  );
}

/** The live page part: the feedback hook plus the view. */
export function FeedbackForm() {
  return <FeedbackFormView feedback={useBetaFeedback()} />;
}
