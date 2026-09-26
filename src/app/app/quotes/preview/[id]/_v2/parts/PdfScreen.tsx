import Link from "next/link";
import { ArrowClockwise, CaretLeft, GearSix } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { Screen } from "@/components/ui/screen";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import { TopBar } from "@/components/ui/top-bar";
import { BUSINESS_NAME_REQUIRED } from "@/lib/business-name";

const TITLE = "Quote PDF";

const quoteHref = (quoteId: string) => `/app/quotes/preview/${quoteId}`;

/** "‹ Back" to the quote, drawn as the kit's TopBar draws its back link, with the viewer's test id. */
function BackToQuote({ quoteId }: { quoteId: string }) {
  return (
    <Link
      href={quoteHref(quoteId)}
      data-testid="pdf-back"
      className={cx(
        "ui-focus-ring inline-flex min-h-12 min-w-12 shrink-0 items-center gap-1 rounded-ui-md pr-3 pl-1 text-ui-base font-semibold text-ui-brand-text no-underline hover:bg-ui-surface-2",
        TAP,
        PRESS,
      )}
    >
      <CaretLeft aria-hidden="true" weight="bold" className="text-[1.375rem]" />
      Back
    </Link>
  );
}

/**
 * The quote's PDF in the new look (/app/quotes/preview/[id]/pdf): the kit's
 * top bar with Back to the quote, and the PDF filling the rest. Fixed over
 * the page like the classic viewer, so pinch-zoom and sideways swipes stay
 * inside the frame; it pads the notch itself, sits under the status-bar
 * strip, and from `sm` leaves the side rail showing.
 */
export function PdfViewerScreen({ quoteId }: { quoteId: string }) {
  return (
    <div
      data-testid="pdf-viewer"
      className={cx(
        "fixed inset-0 z-30 flex flex-col bg-ui-bg [color-scheme:var(--ui-color-scheme)] sm:left-[calc(6rem+env(safe-area-inset-left))]",
        UI_TEXT,
      )}
    >
      <TopBar title={TITLE} leading={<BackToQuote quoteId={quoteId} />} />
      <div className="min-h-0 flex-1 overflow-auto bg-ui-surface-2">
        <iframe
          data-testid="pdf-iframe"
          src={`/api/quotes/${quoteId}/pdf`}
          title={TITLE}
          className="block h-full w-full border-0"
        />
      </div>
    </div>
  );
}

export type PdfProblem = "no-business-name" | "profile-error";

/**
 * Why there's no PDF to show yet, with the fix: add the business name in
 * Settings, or (when the details couldn't be read) a full reload.
 */
export function PdfNotReadyScreen({ quoteId, problem }: { quoteId: string; problem: PdfProblem }) {
  return (
    <Screen data-testid="pdf-not-ready">
      <TopBar title={TITLE} leading={<BackToQuote quoteId={quoteId} />} safeArea={false} />
      <main className="mx-auto w-full max-w-xl px-4 pt-5 pb-8">
        <div role="alert">
          {problem === "profile-error" ? (
            <Callout
              tone="bad"
              title="Couldn't load your business details"
              action={
                <a href={`${quoteHref(quoteId)}/pdf`} className={buttonClasses({ variant: "secondary" })}>
                  <ArrowClockwise aria-hidden="true" weight="bold" className="text-[1.15em]" />
                  <span>Try again</span>
                </a>
              }
            >
              Nothing has been changed. Check your signal, then try again.
            </Callout>
          ) : (
            <Callout
              tone="warn"
              title="Your PDF needs your business name"
              action={
                <ButtonLink href={BUSINESS_NAME_REQUIRED.settings_url} variant="secondary" icon={<GearSix weight="bold" />}>
                  Open Settings
                </ButtonLink>
              }
            >
              {BUSINESS_NAME_REQUIRED.message}
            </Callout>
          )}
        </div>
      </main>
    </Screen>
  );
}
