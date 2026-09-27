"use client";

import { ChatCircle, Check, Flag, Prohibit, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

/**
 * The chat moderation controls in the new look (ChatModerationControls
 * look="new"). Same buttons, test ids and rules for when they're disabled;
 * the state and the moderate route stay in ChatModerationControls.
 */
export function ChatModerationControlsV2({
  chatDisabled,
  pending,
  reported,
  error,
  onToggle,
  onReport,
}: {
  chatDisabled: boolean;
  pending: boolean;
  reported: boolean;
  error: string | null;
  onToggle: () => void;
  onReport: () => void;
}) {
  return (
    <div data-testid="chat-moderation-controls" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={onToggle}
          data-testid="chat-toggle-disabled"
          icon={chatDisabled ? <ChatCircle weight="bold" /> : <Prohibit weight="bold" />}
        >
          {chatDisabled ? "Turn chat on" : "Turn chat off"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || reported}
          onClick={onReport}
          data-testid="chat-report-tradie"
          icon={reported ? <Check weight="bold" /> : <Flag weight="bold" />}
        >
          {reported ? "Reported" : "Report chat"}
        </Button>
      </div>
      {chatDisabled ? (
        <p className="text-ui-sm text-ui-muted">Chat is off, so your client can&apos;t send messages on this quote.</p>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-ui-sm font-semibold text-ui-bad">
          <WarningCircle aria-hidden="true" weight="bold" className="mt-0.5 shrink-0 text-[1.125rem]" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
