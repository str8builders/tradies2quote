"use client";

import { ArrowSquareOut, MapPin } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { formatTime } from "@/lib/timesheet/hours";
import { dayLabel } from "@/lib/timesheet/week";
import { PIN_TONE, StaticSiteMap, type MapPinTone } from "../../_v2/ui/StaticSiteMap";
import { entryPlace, type EntryPlace } from "../_lib/places";
import type { TimesheetEntry } from "../_lib/types";

const MAP_HEIGHT = 220;

/**
 * "Open in Maps": a plain link to Apple Maps, so the phone hands it to its
 * Maps app (it opens outside Tradies2Quote; Google Maps on other phones).
 */
export function OpenInMaps({
  href,
  variant = "secondary",
  size,
  fullWidth = false,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="open-in-maps"
      className={buttonClasses({ variant, size, fullWidth })}
    >
      <span aria-hidden="true" className="inline-flex shrink-0 text-[1.15em]">
        <ArrowSquareOut weight="bold" />
      </span>
      <span>Open in Maps</span>
    </a>
  );
}

const KEY: ReadonlyArray<{ kind: keyof EntryPlace["kinds"]; tone: MapPinTone; text: string }> = [
  { kind: "site", tone: "brand", text: "Job site" },
  { kind: "start", tone: "info", text: "Clocked in" },
  { kind: "end", tone: "ok", text: "Finished" },
];

/** What the map shows, for screen readers. */
function mapLabel(place: EntryPlace): string {
  const parts = [
    place.kinds.site ? "the job site" : null,
    place.kinds.start ? "where you clocked in" : null,
    place.kinds.end ? "where you finished" : null,
  ].filter((p): p is string => Boolean(p));
  const words = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Map of ${words}`;
}

/** The pins' colours in words, when there's more than one kind on the map. */
function PinKey({ kinds }: { kinds: EntryPlace["kinds"] }) {
  const shown = KEY.filter((k) => kinds[k.kind]);
  if (shown.length < 2) return null;
  return (
    <ul aria-label="On the map" className="flex flex-wrap gap-x-4 gap-y-1 text-ui-sm text-ui-muted">
      {shown.map((k) => (
        <li key={k.kind} className="inline-flex items-center gap-1">
          <MapPin aria-hidden="true" weight="fill" className={cx("text-[1.25rem]", PIN_TONE[k.tone])} />
          {k.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * Where an entry's hours were: a small map with the job's pin and where
 * you clocked in and finished, the address, and Open in Maps. The map's
 * tiles load only while this is open.
 */
export function JobLocationSheet({ entry, onClose }: { entry: TimesheetEntry | null; onClose: () => void }) {
  const place = entry ? entryPlace(entry) : null;
  return (
    <BottomSheet
      open={Boolean(entry && place)}
      onClose={onClose}
      title={place?.title ?? "Job location"}
      description={
        entry ? `${dayLabel(entry.workDate)} · ${formatTime(entry.start)} to ${formatTime(entry.finish)} · ${entry.person}` : undefined
      }
    >
      {entry && place ? (
        <div className="space-y-4" data-testid="job-location">
          {place.points.length > 0 ? (
            <>
              <StaticSiteMap points={place.points} height={MAP_HEIGHT} label={mapLabel(place)} testId="job-location-map" />
              <PinKey kinds={place.kinds} />
            </>
          ) : null}
          {place.address ? (
            <p className="flex items-start gap-2 text-ui-base text-ui-text">
              <MapPin aria-hidden="true" weight="duotone" className="mt-0.5 shrink-0 text-[1.25rem] text-ui-brand-text" />
              <span className="min-w-0 break-words">{place.address}</span>
            </p>
          ) : null}
          {place.kinds.site ? null : place.address ? (
            <p className="text-ui-sm text-ui-muted">This job isn&apos;t on the map yet. Maps can find it from the address.</p>
          ) : null}
          <OpenInMaps href={place.mapsHref} variant="primary" fullWidth />
        </div>
      ) : null}
    </BottomSheet>
  );
}
