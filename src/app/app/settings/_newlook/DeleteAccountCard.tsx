"use client";

import { useState, useTransition } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { TextField } from "@/components/ui/text-field";
import { deleteAccountAction } from "../delete-account-actions";

/** The typed word that unlocks deletion; the action checks it again. */
export const DELETE_CONFIRM_WORD = "DELETE";

/**
 * Delete your account (Apple 5.1.1(v)) with the old page's two steps: open
 * it, then type DELETE before the existing action runs. On success the
 * action signs out and leaves the app; we only land back here on a failure.
 */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || confirm !== DELETE_CONFIRM_WORD) return;
    setError("");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await deleteAccountAction(formData);
      if (result && !result.ok) setError(result.error);
    });
  };

  const cancel = () => {
    setOpen(false);
    setConfirm("");
    setError("");
  };

  return (
    <Card
      as="section"
      padding="lg"
      className="space-y-4"
      aria-labelledby="delete-account-title"
      data-testid="settings-delete-account-block"
    >
      <SectionTitle
        id="delete-account-title"
        description="Removes your login, quotes, invoices, clients, prices and files for good."
      >
        Delete your account
      </SectionTitle>

      {!open ? (
        <Button
          variant="danger"
          fullWidth
          icon={<Trash weight="bold" />}
          onClick={() => setOpen(true)}
          data-testid="settings-delete-account-open"
        >
          Delete my account
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Callout tone="bad" title="This can't be undone">
            Everything goes: your business profile, all quotes and their PDFs, invoices, clients,
            material library, calendar notes, and any active subscription is cancelled. Records we
            are legally required to keep (for example tax records for payments already made) are
            kept only as long as the law requires.
          </Callout>
          <TextField
            label={`Type ${DELETE_CONFIRM_WORD} to confirm`}
            name="confirm"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={DELETE_CONFIRM_WORD}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            data-testid="settings-delete-account-confirm"
          />
          <Button
            type="submit"
            variant="danger"
            fullWidth
            icon={<Trash weight="bold" />}
            disabled={confirm !== DELETE_CONFIRM_WORD}
            loading={pending}
            loadingLabel="Deleting…"
            data-testid="settings-delete-account-submit"
          >
            Delete forever
          </Button>
          <Button variant="ghost" fullWidth onClick={cancel} disabled={pending}>
            Keep my account
          </Button>
          {error ? (
            <p role="alert" data-testid="settings-delete-account-error" className="text-ui-sm font-semibold text-ui-bad">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Card>
  );
}
