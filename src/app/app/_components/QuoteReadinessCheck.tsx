import {
  CheckCircle,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import {
  checkQuoteReadiness,
  summarizeReadiness,
  type ProfileForReadiness,
  type ReadinessStatus,
} from "@/lib/quote-readiness";
import type { QuoteData } from "@/lib/quote-types";
import { QuoteReadinessCheckV2 } from "./QuoteReadinessCheckV2";

/**
 * Quote readiness panel — shown above the editor on `/app/quotes/preview/[id]`.
 *
 * Pure server component. Reads the same `quote_data` JSONB the editor
 * already loaded, plus the user's profile row, and renders a 12-item
 * checklist with a single banner summary at the top:
 *   - "Ready to send"           (every required item complete)
 *   - "Needs review"            (some warnings, nothing critical missing)
 *   - "Missing required details" (at least one required item missing)
 *
 * Per the Wave 11 brief, this does **not** block the Send button. It
 * just informs the user before they hit send. The Send button itself
 * lives in the existing `QuoteEditor` and is unchanged by this wave.
 *
 * `look="new"` draws the same checks with the kit (QuoteReadinessCheckV2)
 * for the new-look job page.
 */
interface Props {
  quoteData: QuoteData | null;
  profile: ProfileForReadiness | null;
  expiresAt: string | null;
  look?: "classic" | "new";
}

const BANNER_STYLES: Record<
  "ready" | "review" | "missing",
  { wrapper: string; label: string; icon: React.ReactNode; title: string }
> = {
  ready: {
    wrapper: "border-brand/40 bg-brand/10",
    label: "text-brand",
    icon: <CheckCircle size={20} weight="fill" />,
    title: "Ready to send",
  },
  review: {
    wrapper: "border-hivis/40 bg-hivis/10",
    label: "text-hivis",
    icon: <Warning size={20} weight="fill" />,
    title: "Needs review",
  },
  missing: {
    wrapper: "border-red-500/40 bg-red-500/10",
    label: "text-red-300",
    icon: <WarningOctagon size={20} weight="fill" />,
    title: "Missing required details",
  },
};

const ITEM_STATUS_STYLES: Record<ReadinessStatus, string> = {
  complete: "text-brand",
  warning: "text-hivis",
  missing: "text-red-300",
};

function itemGlyph(status: ReadinessStatus) {
  if (status === "complete")
    return <CheckCircle size={14} weight="fill" />;
  if (status === "warning") return <Warning size={14} weight="fill" />;
  return <WarningOctagon size={14} weight="fill" />;
}

export function QuoteReadinessCheck({ quoteData, profile, expiresAt, look = "classic" }: Props) {
  const items = checkQuoteReadiness(quoteData, profile, expiresAt);
  const summary = summarizeReadiness(items);
  if (look === "new") return <QuoteReadinessCheckV2 items={items} summary={summary} />;
  const banner = BANNER_STYLES[summary.status];

  return (
    <section
      data-testid="quote-readiness"
      data-readiness-status={summary.status}
      className={`t2q-card-pro mb-6 p-5 sm:p-6 border ${banner.wrapper.replace("bg-", "bg-")}`}
    >
      {/* Banner */}
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`shrink-0 ${banner.label}`}>
          {banner.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            data-testid="readiness-banner-title"
            className={`font-display text-lg uppercase tracking-tight sm:text-xl ${banner.label}`}
          >
            {banner.title}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
            {summary.ready}/{summary.total} complete
            {summary.review > 0 ? ` · ${summary.review} review` : ""}
            {summary.missing > 0 ? ` · ${summary.missing} missing` : ""}
          </p>
        </div>
      </div>

      {/* Items */}
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {items.map((it) => (
          <li
            key={it.id}
            data-testid={`readiness-item-${it.id}`}
            data-readiness-item-status={it.status}
            className="flex items-start gap-2"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${ITEM_STATUS_STYLES[it.status]}`}
            >
              {itemGlyph(it.status)}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-white">{it.label}</p>
              {it.detail ? (
                <p
                  className={`mt-0.5 text-xs ${
                    it.status === "complete"
                      ? "text-ink-400"
                      : "text-ink-200"
                  }`}
                >
                  {it.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {"// sending is allowed at any time — this list is a soft warn"}
      </p>
    </section>
  );
}
