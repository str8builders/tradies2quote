"use client";

import { useState } from "react";
import { CalendarPlus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { formatShortDayDate } from "@/lib/format-date";
import { addJobToCalendar, type CalendarJob } from "@/lib/native/calendar";
import { useHasNativeModule } from "@/lib/native/use-native-module";
import { ToolSection } from "./ToolSection";

export interface CalendarNote {
  tone: "ok" | "bad";
  text: string;
}

/** The tool as drawn: the button, and what happened the last time it was tapped. */
export function AddToCalendarToolView({ job, busy, note, onAdd }: { job: CalendarJob; busy: boolean; note: CalendarNote | null; onAdd: () => void }) {
  return (
    <ToolSection id="calendar" title="Your phone's calendar" subtitle="Put this job on it">
      <div className="space-y-3">
        <p className="text-ui-sm text-ui-muted">
          Opens your calendar&apos;s new-event screen for {formatShortDayDate(job.date)}, filled in. You choose which calendar it goes on.
        </p>
        <Button
          variant="secondary"
          fullWidth
          icon={<CalendarPlus weight="bold" />}
          loading={busy}
          loadingLabel="Opening…"
          onClick={onAdd}
          data-testid="job-add-to-calendar"
        >
          Add to my calendar
        </Button>
        {note ? (
          <div role="status">
            <Callout tone={note.tone} title={note.text} />
          </div>
        ) : null}
      </div>
    </ToolSection>
  );
}

/**
 * "Add to my calendar" for a booked job. It opens the phone's own new-event
 * screen, filled in with the job, so it only exists in the iPhone app; in a
 * browser the tool isn't there at all.
 */
export function AddToCalendarTool({ job }: { job: CalendarJob }) {
  const available = useHasNativeModule("T2QCalendar");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<CalendarNote | null>(null);
  if (!available) return null;

  async function add() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const result = await addJobToCalendar(job);
    setBusy(false);
    if (!result.ok) setNote({ tone: "bad", text: result.message });
    else if (result.saved) setNote({ tone: "ok", text: "Added to your calendar." });
  }

  return <AddToCalendarToolView job={job} busy={busy} note={note} onAdd={add} />;
}
