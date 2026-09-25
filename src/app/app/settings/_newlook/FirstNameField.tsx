"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { FIRST_NAME_MAX, normalizeFirstName } from "@/lib/profile-name";
import { setFirstNameAction } from "../first-name-actions";

/**
 * Your first name, for the greeting on Home ("Good morning, Challis") and
 * the account sheet. Blank is fine: the greeting then uses the business
 * name. Saved with its own button so typing never saves half a name.
 */
export function FirstNameField({ initial }: { initial: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tidy = normalizeFirstName(value);
  const changed = (tidy.ok ? (tidy.value ?? "") : value) !== saved;

  const onSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!tidy.ok) {
      setError(tidy.error);
      return;
    }
    startTransition(async () => {
      try {
        const result = await setFirstNameAction(value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const next = result.value ?? "";
        setValue(next);
        setSaved(next);
        toast.show(next ? `Hi ${next}. Name saved` : "Name cleared");
        router.refresh();
      } catch {
        setError("Couldn't save your name. Check your signal and try again.");
      }
    });
  };

  return (
    <form onSubmit={onSave} className="space-y-3" data-testid="settings-first-name">
      <TextField
        label="Your first name"
        hint="Home greets you with it: Good morning, and your name."
        error={error ?? undefined}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={FIRST_NAME_MAX}
        autoComplete="given-name"
        autoCapitalize="words"
        enterKeyHint="done"
        name="first_name"
      />
      <Button type="submit" variant="secondary" loading={pending} loadingLabel="Saving…" disabled={!changed && !pending}>
        Save name
      </Button>
    </form>
  );
}
