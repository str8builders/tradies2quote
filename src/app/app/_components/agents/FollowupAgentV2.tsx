import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import type { FollowupMessage } from "@/lib/agents/followup";
import { CopyButton } from "./CopyButton";

/**
 * The follow-up messages in the new look (FollowupAgent look="new"). Same
 * messages, order (the one to send now first) and test ids as the classic
 * panel. Nothing is sent from here: each message is copied by hand.
 */
export function FollowupAgentV2({ messages }: { messages: FollowupMessage[] }) {
  return (
    <section data-testid="agent-followup" className="space-y-4">
      {messages.length === 0 ? (
        <p data-testid="agent-followup-empty" className="text-ui-muted">
          No follow-up messages fit yet. Send the quote first.
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              data-testid={`agent-followup-${m.id}`}
              data-applies={m.applies}
              data-recommended={m.recommended}
              className={cx("rounded-ui-md bg-ui-surface-2 p-3", m.recommended && "border-2 border-ui-brand")}
            >
              {m.recommended ? (
                <p
                  data-testid="agent-followup-recommended"
                  className="mb-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-ui-brand-soft px-3 py-1 text-ui-sm font-semibold text-ui-brand-text"
                >
                  <PaperPlaneTilt aria-hidden="true" weight="bold" />
                  Send this one now
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{m.label}</p>
                  {m.recommended && m.timingHint ? <p className="text-ui-sm">{m.timingHint}</p> : null}
                  {!m.applies && m.whyNotApply ? <p className="text-ui-sm text-ui-muted">{m.whyNotApply}</p> : null}
                </div>
                <CopyButton
                  look="new"
                  text={m.body}
                  label={
                    <>
                      Copy<span className="sr-only"> {m.label}</span>
                    </>
                  }
                  testId={`copy-followup-${m.id}`}
                  disabled={!m.applies}
                />
              </div>
              <p
                className={cx(
                  "mt-3 whitespace-pre-line break-words rounded-ui-sm border border-ui-line bg-ui-surface p-3 text-ui-sm",
                  !m.applies && "text-ui-muted",
                )}
              >
                {m.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-ui-sm text-ui-muted">Nothing is sent from here. Copy a message into your own text or email.</p>
    </section>
  );
}
