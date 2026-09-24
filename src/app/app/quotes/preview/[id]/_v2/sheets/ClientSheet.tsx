"use client";

import { useEffect, useId, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { TextField } from "@/components/ui/text-field";
import type { QuoteClient } from "@/lib/quote-types";
import { clientForm, clientFormProblem, clientFromForm, sameClient, type ClientForm } from "../contact";

type SavedClient = QuoteClient & { id: string };

/** The address book the classic editor's "Use a saved client" reads (/api/clients). */
function useSavedClients(): SavedClient[] {
  const [items, setItems] = useState<SavedClient[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/clients", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { clients?: SavedClient[] };
        if (Array.isArray(data.clients)) setItems(data.clients);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return items;
}

export interface ClientSheetProps {
  client: QuoteClient;
  onSave: (client: QuoteClient) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
}

/** Who the quote is for: name, mobile, email and address, saved with the quote. */
export function ClientSheet({ client, onSave, onClose }: ClientSheetProps) {
  const [form, setForm] = useState<ClientForm>(() => clientForm(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const saved = useSavedClients();
  const pickId = useId();
  const set = (patch: Partial<ClientForm>) => setForm((f) => ({ ...f, ...patch }));
  const problem = clientFormProblem(form);

  async function save() {
    setTried(true);
    if (problem) return;
    const next = clientFromForm(client, form);
    if (sameClient(next, client)) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onSave(next);
    setBusy(false);
    if ("error" in result) setError(result.error);
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Client details"
      description="Who the quote is for, and how to reach them."
      footer={
        <Button fullWidth data-testid="job-client-save" loading={busy} loadingLabel="Saving…" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="space-y-5">
        {saved.length > 0 ? (
          <div>
            <label htmlFor={pickId} className="mb-2 block text-ui-base font-semibold text-ui-text">
              Use a saved client
            </label>
            <select
              id={pickId}
              defaultValue=""
              onChange={(event) => {
                const pick = saved.find((c) => c.id === event.target.value);
                if (pick) setForm(clientForm({ name: pick.name, address: pick.address, email: pick.email, phone: pick.phone }));
                event.target.value = "";
              }}
              className={cx(
                "ui-focus-ring block min-h-14 w-full rounded-ui-md border-2 border-ui-line-strong bg-ui-surface px-4 text-ui-lg text-ui-text",
              )}
            >
              <option value="">Pick a client…</option>
              {saved.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <TextField label="Name" value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
        <TextField
          label="Mobile"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => set({ phone: e.target.value })}
          hint="For sending the quote by text."
          autoComplete="off"
        />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
          error={tried && problem === "email" ? "That email address doesn't look right." : undefined}
          autoComplete="off"
        />
        <TextField label="Address" value={form.address} onChange={(e) => set({ address: e.target.value })} autoComplete="off" />
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
