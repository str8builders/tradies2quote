"use client";

import { ArrowCounterClockwise, Sparkle, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { useDismissRequest } from "../_components/DismissRequestButton";
import { useGenerateRequest } from "../_components/GenerateRequestButton";

/** Dismiss (or restore) a request: the same action as the old look's button. */
export function DismissRequestAction({ id, dismissed }: { id: string; dismissed: boolean }) {
  const { pending, error, toggle } = useDismissRequest(id, dismissed);
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        fullWidth
        loading={pending}
        icon={dismissed ? <ArrowCounterClockwise weight="bold" /> : <X weight="bold" />}
        onClick={toggle}
        data-testid={dismissed ? "request-restore" : "request-dismiss"}
      >
        {dismissed ? "Restore" : "Dismiss"}
      </Button>
      {error ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Write the draft now, when the automatic run never finished: the same route as the old look's button. */
export function GenerateRequestAction({ quoteId }: { quoteId: string }) {
  const { busy, error, note, generate } = useGenerateRequest(quoteId);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        fullWidth
        loading={busy}
        loadingLabel="Generating…"
        icon={<Sparkle weight="fill" />}
        onClick={() => void generate()}
        data-testid="request-generate"
      >
        Generate draft now
      </Button>
      {error ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="text-ui-sm text-ui-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}
