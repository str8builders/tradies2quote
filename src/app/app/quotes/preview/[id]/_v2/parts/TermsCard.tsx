import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";

/**
 * The quote's terms, as the client will read them: the first few lines, and
 * Edit (View once the quote is locked) opens the terms sheet.
 */
export function TermsCard({ terms, locked, onOpen }: { terms: string | null | undefined; locked: boolean; onOpen: () => void }) {
  const text = terms?.trim() ?? "";
  return (
    <section aria-labelledby="job-terms" className="space-y-3" data-testid="job-terms">
      <SectionTitle
        id="job-terms"
        action={
          text ? (
            <Button variant="ghost" size="sm" onClick={onOpen}>
              {locked ? "View" : "Edit"}
            </Button>
          ) : null
        }
      >
        Terms
      </SectionTitle>
      <Card>
        {text ? (
          <p className="line-clamp-4 whitespace-pre-line text-ui-base text-ui-text">{text}</p>
        ) : (
          <>
            <p className="text-ui-muted">No terms on this quote yet.</p>
            {locked ? null : (
              <Button variant="secondary" fullWidth className="mt-3" onClick={onOpen}>
                Add terms
              </Button>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
