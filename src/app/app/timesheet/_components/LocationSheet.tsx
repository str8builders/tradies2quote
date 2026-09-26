"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { TextField } from "@/components/ui/text-field";
import { Toggle } from "@/components/ui/toggle";
import { TAP } from "@/components/ui/styles";
import { hasNativeLocation, nativeLocation, type LocationPermission } from "@/lib/location/device";
import { isStaleDeployError, reloadForUpdate } from "@/lib/stale-deploy";
import { announceLocationChanged } from "../../_v2/shell/LocationBridge";
import { saveLocationConsent } from "../location-actions";
import type { LocationState } from "../_lib/location-types";

const DAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 0, label: "Sun" },
] as const;

/**
 * Location, in the person's own hands: what it does in plain words, then
 * on/off, automatic clock-in (iPhone app) and the hours it may run in.
 * In the iPhone app, turning location on asks iOS for "While using the
 * app"; only automatic clock-in asks for "Always".
 */
export function LocationSheet({
  open,
  onClose,
  consent,
  canInvoice,
}: {
  open: boolean;
  onClose: () => void;
  consent: LocationState["consent"];
  canInvoice: boolean;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Location" description="Your choice. Change it any time.">
      {open ? <LocationForm consent={consent} canInvoice={canInvoice} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

/**
 * After iOS answers: close, or show how to fix it in Settings. "Always" only
 * matters when automatic clock-in is on.
 */
export function permissionOutcome(wantsAuto: boolean, status: LocationPermission): "done" | "off" | "always" {
  if (status === "denied" || status === "restricted") return "off";
  if (wantsAuto && status !== "always") return "always";
  return "done";
}

export function LocationForm({
  consent,
  canInvoice,
  onDone,
}: {
  consent: LocationState["consent"];
  canInvoice: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const native = hasNativeLocation();
  const [granted, setGranted] = useState(consent.granted);
  const [autoClock, setAutoClock] = useState(consent.autoClock);
  const [workStart, setWorkStart] = useState(consent.workStart);
  const [workEnd, setWorkEnd] = useState(consent.workEnd);
  const [days, setDays] = useState<number[]>(consent.workDays);
  const [error, setError] = useState<string | null>(null);
  /** iOS said no (or not "Always"): the steps to fix it in Settings. */
  const [settingsHelp, setSettingsHelp] = useState<"off" | "always" | null>(null);
  const [pending, startTransition] = useTransition();
  const wantsAuto = granted && autoClock;

  const save = () => {
    setError(null);
    setSettingsHelp(null);
    startTransition(async () => {
      try {
        const result = await saveLocationConsent({ granted, autoClock: wantsAuto, workStart, workEnd, workDays: days });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        announceLocationChanged();
        router.refresh();
        if (native && granted) {
          const unknown: { status: LocationPermission } = { status: "notDetermined" };
          const { status } = await (wantsAuto ? nativeLocation.requestAlways() : nativeLocation.requestWhenInUse()).catch(() => unknown);
          const outcome = permissionOutcome(wantsAuto, status);
          if (outcome !== "done") {
            setSettingsHelp(outcome);
            return;
          }
        }
        onDone();
      } catch (e) {
        if (isStaleDeployError(e)) return reloadForUpdate(setError);
        setError("Couldn't save that. Check your signal and try again.");
      }
    });
  };

  return (
    <div className="space-y-4" data-testid="location-form">
      <ul className="list-disc space-y-1.5 pl-5 text-ui-sm text-ui-muted">
        <li>When you start or finish work, the app saves where you are, e.g. &ldquo;At the Hemi Walker job&rdquo;.</li>
        <li>While you&apos;re clocked in it keeps your route, to work out kilometres for travel.</li>
        <li>Nothing is recorded when you&apos;re not clocked in. Your route is deleted after 90 days.</li>
        <li>
          {canInvoice
            ? "You see where your team is while they're clocked in; each person sees their own."
            : "You see your own; the business owner sees your hours and where you are while you're clocked in."}
        </li>
      </ul>

      <Toggle checked={granted} onChange={setGranted} label="Use my location for work" />

      <Toggle
        checked={granted && autoClock}
        onChange={setAutoClock}
        disabled={!granted || !native}
        label="Automatic clock-in at jobs"
        description={
          native
            ? "Starts your hours when you arrive at a job and stops them when you leave, in your work hours only. Your phone checks this itself; nothing is sent until you arrive."
            : "In the Tradies2Quote iPhone app."
        }
      />

      {granted && autoClock ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="From" type="time" step={900} value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            <TextField label="Until" type="time" step={900} value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
          </div>
          <fieldset>
            <legend className="mb-2 block text-ui-base font-semibold text-ui-text">Work days</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map(({ n, label }) => {
                const on = days.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setDays((d) => (on ? d.filter((x) => x !== n) : [...d, n]))}
                    className={cx(
                      "ui-focus-ring min-h-12 rounded-ui-md text-ui-sm font-semibold",
                      TAP,
                      on ? "border-2 border-ui-info bg-ui-info-soft text-ui-text" : "border border-ui-line bg-ui-surface text-ui-muted",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}

      {native && granted && !settingsHelp ? (
        <p className="text-ui-sm text-ui-muted" data-testid="location-ios-note">
          {wantsAuto ? (
            <>
              iPhone will ask to allow location &ldquo;Always&rdquo;. That&apos;s only so it can spot when you arrive at and leave a job with
              the app closed. Change it any time in Settings, Tradies2Quote, Location.
            </>
          ) : (
            <>iPhone will ask to use your location while you&apos;re using the app.</>
          )}
        </p>
      ) : null}

      {settingsHelp ? (
        <div role="status" className="space-y-3 rounded-ui-md bg-ui-warn-soft p-3 text-ui-sm text-ui-text" data-testid="location-settings-help">
          <p>
            {settingsHelp === "off"
              ? "Location is off for Tradies2Quote on this iPhone. To use it, open Settings, then Location, and choose While Using the App (or Always for automatic clock-in)."
              : "Automatic clock-in needs location set to Always. Open Settings, then Location, and choose Always. Until then your hours start and stop when you tap."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => void nativeLocation.openSettings().catch(() => {})}>
              Open Settings
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}

      <Button fullWidth onClick={save} loading={pending} loadingLabel="Saving…">
        Save
      </Button>
    </div>
  );
}
