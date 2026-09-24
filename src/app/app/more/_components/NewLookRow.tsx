"use client";

import { useState, useTransition } from "react";
import { Toggle } from "@/components/ui/toggle";
import { setNewLookAction } from "../../settings/new-look-actions";

/**
 * "New look (preview)" for people allowed to choose (the owner while the
 * default is off): always one tap from going back to the current look.
 * Turning it off saves the choice and reloads into the current look.
 */
export function NewLookRow() {
  const [on, setOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    setOn(next);
    setError(null);
    startTransition(async () => {
      const result = await setNewLookAction(next);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
        return;
      }
      if (!result.on) window.location.assign("/app");
    });
  };

  return (
    <div className="px-4 py-3" data-testid="more-new-look">
      <Toggle
        checked={on}
        onChange={change}
        disabled={pending}
        label="New look (preview)"
        description="Turn it off to go back to the current look."
      />
      {error ? (
        <p role="alert" className="mt-2 text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
