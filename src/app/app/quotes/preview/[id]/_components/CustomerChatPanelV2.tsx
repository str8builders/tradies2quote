import { ChatCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { StatusPill } from "@/components/ui/status-pill";
import { ChatModerationControls } from "./ChatModerationControls";

// The customer chat in the new look (CustomerChatPanel look="new"). Same
// history, notes, controls and test ids as the classic panel, which reads
// quote_data and hands the thread over; only the drawing differs.

/** One message, with its time already in words ("Tue 3:45 pm"). */
export interface ChatMessageV2 {
  role: "customer" | "assistant";
  content: string;
  when: string;
}

interface ChatProps {
  quoteId: string;
  chatDisabled: boolean;
}

function Controls({ quoteId, chatDisabled }: ChatProps) {
  return <ChatModerationControls quoteId={quoteId} chatDisabled={chatDisabled} look="new" />;
}

/** Nothing asked yet: what the client can do, and that it shows up here. */
export function CustomerChatEmptyV2(props: ChatProps) {
  return (
    <div className="space-y-4">
      <Controls {...props} />
      <div data-testid="customer-chat-empty" className="rounded-ui-md bg-ui-surface-2 p-4">
        <p className="font-semibold">No messages yet</p>
        <p className="mt-1 text-ui-sm text-ui-muted">
          When your client opens the quote link, they can tap the chat button and ask questions. T2Q answers from
          the quote&apos;s own numbers, flags anything that needs you, and never agrees to a price change without you.
          The conversation shows up here.
        </p>
      </div>
    </div>
  );
}

/** The notes the chat flagged for the tradie first, then the whole thread, oldest first. */
export function CustomerChatThreadV2({
  messages,
  customerCount,
  notes,
  ...props
}: ChatProps & {
  messages: ChatMessageV2[];
  /** How many of the messages the client sent. */
  customerCount: number;
  notes: string[];
}) {
  return (
    <div className="space-y-4">
      <Controls {...props} />
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <ChatCircle aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-brand-text" />
          {customerCount} {customerCount === 1 ? "message" : "messages"} from your client
        </p>
        {notes.length > 0 ? (
          <span data-testid="customer-chat-notes-count" className="ml-auto">
            <StatusPill tone="warn" icon={<WarningCircle weight="bold" />}>
              {notes.length} {notes.length === 1 ? "note" : "notes"} for you
            </StatusPill>
          </span>
        ) : null}
      </div>

      {notes.length > 0 ? (
        <div data-testid="customer-chat-notes">
          <Callout tone="warn" title="The chat flagged these for you">
            <ul className="list-disc space-y-1 pl-5">
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </Callout>
        </div>
      ) : null}

      <ol data-testid="customer-chat-thread" className="space-y-3">
        {messages.map((m, i) => {
          const fromClient = m.role === "customer";
          return (
            <li key={i} className={cx("flex", fromClient ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[88%] rounded-ui-lg px-3 py-2", fromClient ? "bg-ui-brand-soft" : "bg-ui-surface-2")}>
                <p className="text-ui-sm text-ui-muted">
                  <span className="font-semibold">{fromClient ? "Your client" : "T2Q assistant"}</span>, {m.when}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
