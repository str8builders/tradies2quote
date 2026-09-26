"use client";

import { useId, type FormEvent } from "react";
import { FloppyDisk } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { TextField } from "@/components/ui/text-field";
import type { ClientFormValues } from "../_lib/useClientsBook";

export interface ClientEditSheetProps {
  open: boolean;
  form: ClientFormValues;
  onChange: (form: ClientFormValues) => void;
  onSave: (event: FormEvent) => void;
  onClose: () => void;
  busy: boolean;
  /** Why the last save failed (shown in the sheet, over the page). */
  error: string;
}

/**
 * Add a client or change one: the same four boxes, limits and browser
 * checks as the old form, posted to /api/clients by the page's hook. The
 * Save button sits in the sheet's footer and submits the form by its id.
 */
export function ClientEditSheet({ open, form, onChange, onSave, onClose, busy, error }: ClientEditSheetProps) {
  const formId = `client-form${useId().replace(/[^\w-]/g, "")}`;
  const set = (patch: Partial<ClientFormValues>) => onChange({ ...form, ...patch });
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={form.id ? "Edit client" : "Add a client"}
      description="Ready to pick when you review a quote."
      footer={
        <Button
          type="submit"
          form={formId}
          fullWidth
          loading={busy}
          loadingLabel="Saving…"
          icon={<FloppyDisk weight="bold" />}
          data-testid="client-save"
        >
          Save client
        </Button>
      }
    >
      <form id={formId} onSubmit={onSave} className="space-y-5" data-testid="client-form">
        <TextField
          label="Name"
          value={form.name}
          onChange={(event) => set({ name: event.target.value })}
          required
          maxLength={150}
          autoComplete="off"
          data-testid="client-name"
        />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={form.email}
          onChange={(event) => set({ email: event.target.value })}
          maxLength={254}
          autoComplete="off"
        />
        <TextField
          label="Phone"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(event) => set({ phone: event.target.value })}
          maxLength={100}
          autoComplete="off"
        />
        <TextField
          label="Address"
          value={form.address}
          onChange={(event) => set({ address: event.target.value })}
          maxLength={500}
          autoComplete="off"
        />
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </form>
    </BottomSheet>
  );
}
