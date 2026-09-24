"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import type { NewLookDefault } from "@/lib/ui/newLook";
import { setNewLookAction } from "../new-look-actions";

/**
 * "Try the new look (preview)". Rendered only for people allowed to choose
 * (the owner while T2Q_NEW_LOOK_DEFAULT is off); the server action checks
 * the same rule. Built from the new kit, so it is also a first look at it.
 */
export function NewLookSetting({
  initialChoice,
  envDefault,
}: {
  initialChoice: boolean | null;
  envDefault: NewLookDefault;
}) {
  const [choice, setChoice] = useState(initialChoice);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const on = choice ?? envDefault === "on";

  const save = (next: boolean | null) => {
    const previous = choice;
    setChoice(next);
    setError(null);
    startTransition(async () => {
      const result = await setNewLookAction(next);
      if (!result.ok) {
        setChoice(previous);
        setError(result.error);
      }
    });
  };

  return (
    <section data-testid="settings-new-look" className="mb-8">
      <Card padding="lg">
        <Toggle
          checked={on}
          onChange={(next) => save(next)}
          disabled={pending}
          label="Try the new look (preview)"
          description="Bigger text and buttons, plain words and one clear next step. New screens show up here first as each one is ready."
        />
        <p className="mt-3 text-ui-sm text-ui-muted">
          {choice === null
            ? `You're on the default for everyone (${envDefault === "on" ? "new look" : "current look"}).`
            : "This is your own choice. It only changes your account."}
        </p>
        {choice !== null ? (
          <Button variant="ghost" size="sm" className="mt-2" disabled={pending} onClick={() => save(null)}>
            Go back to the default
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-ui-sm font-semibold text-ui-bad">
            {error}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
