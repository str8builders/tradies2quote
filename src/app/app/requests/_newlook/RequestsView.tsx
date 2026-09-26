import { FileText, Tray } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { SETTINGS_PATHS } from "../../settings/_newlook/hub";
import type { RequestItem } from "../_lib/request-status";
import { DismissRequestAction, GenerateRequestAction } from "./RequestButtons";

export const REQUESTS_INTRO =
  "Jobs clients send through your request link. Each one is a draft quote: open it, check the numbers, then send it.";
export const DISMISSED_INTRO = "Requests you've dismissed. Restore one to put it back on your list.";

function RequestCard({ item }: { item: RequestItem }) {
  return (
    <Card as="li" padding="lg" className="space-y-4" data-unseen={item.unseen} data-testid={`request-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ui-title text-ui-lg break-words text-ui-text">{item.clientName}</h2>
          <p className="mt-1 text-ui-sm break-words text-ui-muted">{item.contact}</p>
        </div>
        {item.unseen ? <StatusPill tone="info">New</StatusPill> : null}
      </div>
      <StatusPill tone={item.status.tone}>{item.status.label}</StatusPill>
      <p className="break-words whitespace-pre-wrap text-ui-text">{item.description}</p>
      {item.note ? <Callout tone="warn">{item.note}</Callout> : null}
      <p className="text-ui-sm text-ui-muted">Received {item.received}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {item.quoteId ? (
          <ButtonLink
            href={`/app/quotes/preview/${item.quoteId}`}
            variant="secondary"
            icon={<FileText weight="bold" />}
            data-testid="request-open"
          >
            Open draft quote
          </ButtonLink>
        ) : null}
        {item.quoteId && item.canGenerate ? <GenerateRequestAction quoteId={item.quoteId} /> : null}
        <DismissRequestAction id={item.id} dismissed={item.dismissed} />
      </div>
    </Card>
  );
}

/**
 * /app/requests in the new look: each request as a card with its status in
 * words and the same three actions as before (open the draft, generate it
 * again, dismiss or restore). The top bar comes from <AppHeader>.
 */
export function RequestsView({ items, showDismissed }: { items: RequestItem[]; showDismissed: boolean }) {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10" data-testid="requests-body">
      <div className="space-y-3">
        <p className="text-ui-base text-ui-muted">{showDismissed ? DISMISSED_INTRO : REQUESTS_INTRO}</p>
        {showDismissed ? (
          <ButtonLink href="/app/requests" variant="secondary" size="sm">
            Back to open requests
          </ButtonLink>
        ) : (
          <ButtonLink href="/app/requests?show=dismissed" variant="secondary" size="sm" data-testid="requests-show-dismissed">
            Show dismissed requests
          </ButtonLink>
        )}
      </div>

      {items.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Tray weight="duotone" />}
            title={showDismissed ? "No dismissed requests" : "No requests yet"}
            action={
              showDismissed ? undefined : (
                <ButtonLink href={SETTINGS_PATHS.rates} variant="secondary" fullWidth>
                  Set up your request link
                </ButtonLink>
              )
            }
          >
            {showDismissed
              ? "Anything you dismiss shows up here."
              : "Turn on your request link in Settings and share it with clients. Their jobs land here as draft quotes."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-4" data-testid="request-list">
          {items.map((item) => (
            <RequestCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
