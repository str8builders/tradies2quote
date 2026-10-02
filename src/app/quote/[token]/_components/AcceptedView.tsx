import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { formatCurrency, formatIssueDate } from "@/lib/quote-defaults";
import type { PublicQuotePayload } from "@/lib/quote-types";
import { PublicQuoteSummary } from "./PublicQuoteSummary";

type Props = {
  token: string;
  quote: PublicQuotePayload;
};

export function AcceptedView({ token, quote }: Props) {
  const acceptedDate = quote.accepted_at
    ? formatIssueDate(quote.accepted_at)
    : "";
  return (
    <div className="space-y-6">
      <section
        data-testid="accepted-view"
        className="rounded-sm border border-brand/40 bg-brand/10 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <CheckCircle
            size={28}
            weight="bold"
            className="shrink-0 text-brand"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h1 className="font-display text-xl uppercase tracking-tight text-white sm:text-2xl">
              Quote accepted
            </h1>
            <p className="mt-1 text-sm text-ink-200">
              {quote.accepted_name ? (
                <>
                  Accepted by <strong className="text-white">{quote.accepted_name}</strong>
                  {acceptedDate && ` on ${acceptedDate}`}.
                </>
              ) : (
                <>Accepted{acceptedDate && ` on ${acceptedDate}`}.</>
              )}
            </p>
            <p className="mt-2 text-sm text-ink-200">
              Total{" "}
              <strong className="text-white">
                {formatCurrency(quote.total, quote.currency)}
              </strong>{" "}
              incl {quote.tax_label}.
            </p>
          </div>
        </div>

        {quote.has_signature && (
          <div className="mt-4 border-t border-brand/30 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
              Signature
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/quote/${token}/signature`}
              alt="Client signature"
              className="mt-2 max-h-32 rounded-sm border border-ink-700 bg-white"
            />
          </div>
        )}
      </section>

      <PublicQuoteSummary token={token} quote={quote} />
    </div>
  );
}
