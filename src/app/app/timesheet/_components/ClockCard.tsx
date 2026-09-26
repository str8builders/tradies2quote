"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GearSix, MapPin, MapPinLine, Play, Stop } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { TAP } from "@/components/ui/styles";
import { currentFix } from "@/lib/location/device";
import { siteAt } from "@/lib/location/geo";
import { mapsLink } from "@/lib/location/tiles";
import { BREAK_CHOICES } from "@/lib/timesheet/hours";
import { announceLocationChanged } from "../../_v2/shell/LocationBridge";
import { StaticSiteMap } from "../../_v2/ui/StaticSiteMap";
import { clockIn, clockOut, pinJobSite } from "../location-actions";
import type { LocationState } from "../_lib/location-types";
import type { TimesheetClient } from "../_lib/types";
import { OpenInMaps } from "./JobLocationSheet";
import { LocationSheet } from "./LocationSheet";

const SELECT =
  "ui-focus-ring min-h-14 w-full rounded-ui-md border-2 border-ui-line-strong bg-ui-surface px-4 text-ui-lg text-ui-text";

/** "2 h 14 min" since a moment. */
export function elapsed(since: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** "7:02am" in the business's time zone (the same on the server and the phone). */
export function clockTime(iso: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase().replace(/\./g, "").replace(/\s/g, "")}`;
  } catch {
    return "";
  }
}

/**
 * Start and finish work from the Timesheet: one big button, with where you
 * are pinned when location is on ("At the Hemi Walker job"). Finishing asks
 * for the break and the client, then the hours land on the week. When you're
 * clocked in somewhere that isn't a job site yet, you can save the spot as
 * a client's site.
 */
export function ClockCard({
  state,
  clients,
  canInvoice,
}: {
  state: LocationState;
  clients: readonly TimesheetClient[];
  canInvoice: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [settings, setSettings] = useState(false);
  const open = state.open;
  const on = state.consent.granted;

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const done = () => {
    announceLocationChanged();
    router.refresh();
  };

  const start = () => {
    setError(null);
    startTransition(async () => {
      try {
        const fix = on ? await currentFix() : null;
        const result = await clockIn({ fix, source: "tap" });
        if (!result.ok) return setError(result.error);
        done();
      } catch {
        setError("Couldn't start work. Check your signal and try again.");
      }
    });
  };

  // Clocked in at a client whose job is on the map: show it.
  const site = open?.clientId ? (state.sites.find((s) => s.clientId === open.clientId) ?? null) : null;
  const atSite = Boolean(site);

  return (
    <Card className="space-y-3" data-testid="clock-card">
      <div className="flex items-center gap-3">
        <IconTile icon={<MapPin weight="duotone" />} tone={open ? "ok" : "info"} size="lg" />
        <div className="min-w-0 flex-1">
          {open ? (
            <>
              <p className="ui-title text-ui-lg text-ui-text">Working since {clockTime(open.startedAt, state.timeZone)}</p>
              <p className="text-ui-sm text-ui-muted tabular-nums" suppressHydrationWarning>
                {elapsed(open.startedAt, now)}
              </p>
              {open.place ? <p className="text-ui-sm break-words text-ui-text">{open.place}</p> : null}
              {open.source === "auto" ? (
                <span className="mt-1 inline-flex">
                  <StatusPill tone="info">Started automatically</StatusPill>
                </span>
              ) : null}
            </>
          ) : (
            <>
              <p className="ui-title text-ui-lg text-ui-text">Not clocked in</p>
              <p className="text-ui-sm text-ui-muted">
                {on ? (state.consent.autoClock ? "Location on · automatic clock-in on" : "Location on") : "Location off"}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSettings(true)}
          aria-label="Location settings"
          className={cx("ui-focus-ring inline-flex h-12 w-12 items-center justify-center rounded-ui-md text-[1.375rem] text-ui-muted hover:bg-ui-surface-2", TAP)}
        >
          <GearSix aria-hidden="true" weight="duotone" />
        </button>
      </div>

      {open ? (
        <div className="grid gap-2">
          <Button fullWidth variant="primary" icon={<Stop weight="fill" />} onClick={() => setFinishing(true)} data-testid="clock-finish">
            Finish work
          </Button>
          {on && !atSite ? (
            <Button fullWidth variant="ghost" icon={<MapPinLine weight="bold" />} onClick={() => setPinning(true)}>
              Save this spot as a job site
            </Button>
          ) : null}
        </div>
      ) : (
        <Button fullWidth icon={<Play weight="fill" />} onClick={start} loading={pending} loadingLabel={on ? "Finding you…" : "Starting…"} data-testid="clock-start">
          Start work
        </Button>
      )}

      {open && site ? (
        <div className="space-y-2" data-testid="clock-site">
          <StaticSiteMap points={[{ key: site.clientId, lat: site.lat, lng: site.lng }]} height={140} label={`Map of the ${site.name} job`} />
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-ui-sm break-words text-ui-muted">{site.address?.trim() || `The ${site.name} job`}</p>
            <OpenInMaps href={mapsLink(site, site.name)} size="sm" />
          </div>
        </div>
      ) : null}

      {!on ? (
        <button type="button" onClick={() => setSettings(true)} className="ui-focus-ring rounded-ui-sm text-left text-ui-sm text-ui-brand-text underline-offset-4 hover:underline">
          Turn on location to pin where you start and finish
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}

      <FinishSheet open={finishing} onClose={() => setFinishing(false)} state={state} clients={clients} onDone={done} />
      <PinSheet open={pinning} onClose={() => setPinning(false)} clients={clients} defaultClient={open?.clientId ?? null} onDone={done} />
      <LocationSheet open={settings} onClose={() => setSettings(false)} consent={state.consent} canInvoice={canInvoice} />
    </Card>
  );
}

function FinishSheet({
  open,
  onClose,
  state,
  clients,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  state: LocationState;
  clients: readonly TimesheetClient[];
  onDone: () => void;
}) {
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [clientId, setClientId] = useState<string>(state.open?.clientId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const finish = () => {
    setError(null);
    startTransition(async () => {
      try {
        const fix = state.consent.granted ? await currentFix() : null;
        // Finishing at a job site you didn't start at: that's probably the client.
        const here = fix ? siteAt(fix, state.sites) : null;
        const result = await clockOut({ fix, breakMinutes, clientId: clientId || here?.clientId || null });
        if (!result.ok) return setError(result.error);
        onClose();
        onDone();
      } catch {
        setError("Couldn't finish work. Check your signal and try again.");
      }
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Finish work" description="Your hours go on the timesheet. You can change them after.">
      {open ? (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 block text-ui-base font-semibold text-ui-text">Break</legend>
            <div role="radiogroup" aria-label="Break" className="grid grid-cols-5 gap-2">
              {BREAK_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={breakMinutes === m}
                  onClick={() => setBreakMinutes(m)}
                  className={cx(
                    "ui-focus-ring min-h-12 rounded-ui-md text-ui-base font-semibold",
                    TAP,
                    breakMinutes === m ? "border-2 border-ui-info bg-ui-info-soft text-ui-text" : "border border-ui-line bg-ui-surface text-ui-muted",
                  )}
                >
                  {m === 0 ? "None" : `${m}m`}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="finish-client" className="mb-2 block text-ui-base font-semibold text-ui-text">
              Client
            </label>
            <select id="finish-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={SELECT}>
              <option value="">{state.open?.clientName ? `The ${state.open.clientName} job` : "No client (can't be invoiced)"}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
              {error}
            </p>
          ) : null}
          <Button fullWidth icon={<Stop weight="fill" />} onClick={finish} loading={pending} loadingLabel="Finishing…" data-testid="clock-finish-confirm">
            Finish work
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}

function PinSheet({
  open,
  onClose,
  clients,
  defaultClient,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  clients: readonly TimesheetClient[];
  defaultClient: string | null;
  onDone: () => void;
}) {
  const [clientId, setClientId] = useState<string>(defaultClient ?? clients[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pin = () => {
    setError(null);
    if (!clientId) return setError("Pick the client whose job this is.");
    startTransition(async () => {
      try {
        const fix = await currentFix();
        if (!fix) return setError("Your phone couldn't find you. Check location is allowed, then try again.");
        const result = await pinJobSite({ clientId, fix });
        if (!result.ok) return setError(result.error);
        onClose();
        onDone();
      } catch {
        setError("Couldn't save the site. Try again.");
      }
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Save this spot as a job site" description="Where you're standing becomes the client's site, for pins and automatic clock-in.">
      {open ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="pin-client" className="mb-2 block text-ui-base font-semibold text-ui-text">
              Whose job is this?
            </label>
            <select id="pin-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={SELECT}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
              {error}
            </p>
          ) : null}
          <Button fullWidth icon={<MapPinLine weight="bold" />} onClick={pin} loading={pending} loadingLabel="Finding you…">
            Save the site here
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}
