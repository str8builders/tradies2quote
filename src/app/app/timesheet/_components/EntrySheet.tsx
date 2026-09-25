"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FloppyDisk, Trash } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { TextField } from "@/components/ui/text-field";
import { TAP } from "@/components/ui/styles";
import { BREAK_CHOICES, NOTE_MAX, formatHours, workedTime } from "@/lib/timesheet/hours";
import { deleteTimeEntry, saveTimeEntry } from "../actions";
import type { TimesheetClient, TimesheetEntry } from "../_lib/types";

const NEW_CLIENT = "__new__";

export interface EntryDraft {
  id: string | null;
  workDate: string;
  start: string;
  finish: string;
  breakMinutes: number;
  clientId: string | null;
  note: string;
}

/** A fresh entry: that day, 7:00 to 3:30 with a half-hour break, the last client used. */
export function newDraft(day: string, lastClientId: string | null): EntryDraft {
  return { id: null, workDate: day, start: "07:00", finish: "15:30", breakMinutes: 30, clientId: lastClientId, note: "" };
}

export function draftFrom(entry: TimesheetEntry): EntryDraft {
  return {
    id: entry.id,
    workDate: entry.workDate,
    start: entry.start,
    finish: entry.finish,
    breakMinutes: entry.breakMinutes,
    clientId: entry.clientId,
    note: entry.note ?? "",
  };
}

const SELECT =
  "ui-focus-ring min-h-14 w-full rounded-ui-md border-2 border-ui-line-strong bg-ui-surface px-4 text-ui-lg text-ui-text";

/**
 * Add or change a stretch of your own work: the day, the client, start and
 * finish, the break, and what was done. The hours work themselves out as
 * you type, with the same rules the database keeps.
 */
export function EntrySheet({
  draft,
  clients,
  onClose,
}: {
  draft: EntryDraft | null;
  clients: readonly TimesheetClient[];
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.id ? "Change hours" : "Add hours"}
      description="Start, finish and your break. The hours work themselves out."
    >
      {draft ? <EntryForm key={draft.id ?? `new-${draft.workDate}`} draft={draft} clients={clients} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function EntryForm({
  draft,
  clients,
  onDone,
}: {
  draft: EntryDraft;
  clients: readonly TimesheetClient[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(draft);
  const [clientChoice, setClientChoice] = useState<string>(draft.clientId ?? "");
  const [newClient, setNewClient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const worked = workedTime(form.start, form.finish, form.breakMinutes);
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!worked.ok) {
      setError(worked.error);
      return;
    }
    if (clientChoice === NEW_CLIENT && !newClient.trim()) {
      setError("Type the new client's name, or pick one from the list.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveTimeEntry({
          id: form.id,
          workDate: form.workDate,
          start: form.start,
          finish: form.finish,
          breakMinutes: form.breakMinutes,
          clientId: clientChoice && clientChoice !== NEW_CLIENT ? clientChoice : null,
          newClientName: clientChoice === NEW_CLIENT ? newClient : null,
          note: form.note,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onDone();
      } catch {
        setError("Couldn't save those hours. Check your signal and try again.");
      }
    });
  };

  const remove = () => {
    if (!form.id) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteTimeEntry(form.id!);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onDone();
      } catch {
        setError("Couldn't remove those hours. Try again.");
      }
    });
  };

  return (
    <form onSubmit={save} className="space-y-4" data-testid="timesheet-entry-form">
      <TextField
        label="Day"
        type="date"
        required
        value={form.workDate}
        onChange={(e) => set("workDate", e.target.value)}
      />

      <div>
        <label htmlFor="timesheet-client" className="mb-2 block text-ui-base font-semibold text-ui-text">
          Client
        </label>
        <select
          id="timesheet-client"
          value={clientChoice}
          onChange={(e) => setClientChoice(e.target.value)}
          className={SELECT}
        >
          <option value="">No client (can&apos;t be invoiced)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CLIENT}>+ New client…</option>
        </select>
      </div>
      {clientChoice === NEW_CLIENT ? (
        <TextField
          label="New client's name"
          value={newClient}
          maxLength={150}
          autoComplete="off"
          onChange={(e) => setNewClient(e.target.value)}
          hint="Saved to your client list."
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Start" type="time" step={300} required value={form.start} onChange={(e) => set("start", e.target.value)} />
        <TextField label="Finish" type="time" step={300} required value={form.finish} onChange={(e) => set("finish", e.target.value)} />
      </div>

      <fieldset>
        <legend className="mb-2 block text-ui-base font-semibold text-ui-text">Break</legend>
        <div role="radiogroup" aria-label="Break" className="grid grid-cols-5 gap-2">
          {BREAK_CHOICES.map((minutes) => {
            const on = form.breakMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("breakMinutes", minutes)}
                className={cx(
                  "ui-focus-ring min-h-12 rounded-ui-md text-ui-base font-semibold",
                  TAP,
                  on ? "border-2 border-ui-info bg-ui-info-soft text-ui-text" : "border border-ui-line bg-ui-surface text-ui-muted",
                )}
              >
                {minutes === 0 ? "None" : `${minutes}m`}
              </button>
            );
          })}
        </div>
      </fieldset>

      <TextField
        label="What was done"
        value={form.note}
        maxLength={NOTE_MAX}
        placeholder="e.g. Framing the deck"
        onChange={(e) => set("note", e.target.value)}
      />

      <p
        aria-live="polite"
        data-testid="timesheet-worked"
        className={cx(
          "rounded-ui-md px-4 py-3 text-ui-base font-semibold",
          worked.ok ? "bg-ui-info-soft text-ui-text" : "bg-ui-warn-soft text-ui-text",
        )}
      >
        {worked.ok ? `${formatHours(worked.hours)} worked` : worked.error}
      </p>

      {error ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" fullWidth loading={pending} loadingLabel="Saving…" icon={<FloppyDisk weight="bold" />}>
          Save hours
        </Button>
        {form.id ? (
          <Button variant="ghost" fullWidth onClick={remove} disabled={pending} icon={<Trash weight="bold" />}>
            Remove these hours
          </Button>
        ) : null}
      </div>
    </form>
  );
}
