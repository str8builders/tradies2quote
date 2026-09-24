"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { addCalendarNote } from "@/app/app/_components/calendar-notes-actions";
import { formatShortDayDate } from "@/lib/format-date";
import type { DayNote } from "../types";

/** Longest note the calendar keeps (calendar-notes-actions trims to this). */
const MAX_NOTE = 500;

/**
 * Notes for the day the job is booked — the same personal day notes the
 * dashboard calendar shows (calendar_notes, owner-only), added through its
 * existing action.
 */
export function DayNotes({ day, notes }: { day: string; notes: DayNote[] }) {
  const router = useRouter();
  const [added, setAdded] = useState<DayNote[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = [...notes, ...added.filter((n) => !notes.some((m) => m.id === n.id))];

  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const result = await addCalendarNote(day, body);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setAdded((list) => [...list, { id: result.id, body: body.slice(0, MAX_NOTE) }]);
    setText("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-ui-sm text-ui-muted">For {formatShortDayDate(day)}. They also show on your calendar.</p>
      {shown.length > 0 ? (
        <ul className="space-y-2">
          {shown.map((note) => (
            <li key={note.id} className="rounded-ui-md border border-ui-line bg-ui-surface-2 px-3 py-2 break-words whitespace-pre-line">
              {note.body}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ui-muted">No notes for that day yet.</p>
      )}
      <TextField
        label="Add a note"
        value={text}
        maxLength={MAX_NOTE}
        onChange={(event) => setText(event.target.value)}
        placeholder="Bring the long ladder"
        error={error ?? undefined}
        autoComplete="off"
      />
      <Button variant="secondary" fullWidth disabled={!text.trim()} loading={busy} loadingLabel="Adding…" onClick={add}>
        Add the note
      </Button>
    </div>
  );
}
