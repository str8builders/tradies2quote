"use client";

import { useState } from "react";
import { hasNativeLocation, nativeLocation } from "@/lib/location/device";
import { clockActivityStatus, endClockActivity, syncClockActivity } from "@/lib/native/clock-activity";
import { takeShortcutPath } from "@/lib/native/shortcuts";

/** An ISO time this many minutes ago (called from a click, never while rendering). */
const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

/** Local only: drive the iPhone app's T2QLocation and T2QClockActivity modules by hand (simulator testing). */
export function NativeTest() {
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [`${new Date().toISOString().slice(11, 19)} ${line}`, ...l].slice(0, 40));
  const run = (label: string, fn: () => Promise<unknown>) => async () => {
    try {
      add(`${label}: ${JSON.stringify(await fn())}`);
    } catch (e) {
      add(`${label} ERROR: ${(e as Error).message}`);
    }
  };
  const site = { id: "test-site", name: "Test Site", lat: -37.6868, lng: 176.1654, radius: 150 };
  const button = "block w-full rounded-ui-md bg-ui-surface-2 px-3 py-3 text-left text-ui-base text-ui-text";
  return (
    <main className="space-y-2 p-4 pt-16" data-testid="native-test">
      <p className="text-ui-sm text-ui-hivis">native module: {String(hasNativeLocation())}</p>
      <pre data-testid="native-log" className="sticky top-14 z-10 h-32 overflow-y-auto bg-ui-bg text-ui-xs break-all whitespace-pre-wrap text-ui-text">{log.join("\n")}</pre>
      <button className={button} onClick={run("permission", () => nativeLocation.permission())}>Permission</button>
      <button className={button} onClick={run("requestAlways", () => nativeLocation.requestAlways())}>Request Always</button>
      <button className={button} onClick={run("position", () => nativeLocation.currentPosition())}>Current position</button>
      <button
        className={button}
        onClick={run("configure watch", () =>
          nativeLocation.configure({
            endpoint: "http://localhost:3107/api/location/points",
            token: null,
            tracking: false,
            autoClock: true,
            sites: [site],
            window: { start: "00:00", end: "23:59", days: [0, 1, 2, 3, 4, 5, 6], timeZone: "Pacific/Auckland" },
            openSite: null,
          }),
        )}
      >
        Watch Test Site (auto clock-in)
      </button>
      <button
        className={button}
        onClick={run("configure clocked-in", () =>
          nativeLocation.configure({
            endpoint: "http://localhost:3107/api/location/points",
            token: null,
            tracking: true,
            autoClock: true,
            sites: [site],
            window: { start: "00:00", end: "23:59", days: [0, 1, 2, 3, 4, 5, 6], timeZone: "Pacific/Auckland" },
            openSite: { clientId: "test-site", auto: true },
          }),
        )}
      >
        Clocked in automatically at Test Site
      </button>
      <button className={button} onClick={run("status", () => nativeLocation.status())}>Status</button>
      <button className={button} onClick={run("drain", () => nativeLocation.drainEvents())}>Drain events</button>
      <button className={button} onClick={run("stop", () => nativeLocation.stopAll())}>Stop all</button>
      <button className={button} onClick={run("clock status", () => clockActivityStatus())}>Clock activity: status</button>
      <button
        className={button}
        onClick={run("clock start entry A (2 h 14 min ago)", async () => ({
          result: await syncClockActivity({ id: "test-entry-a", startedAt: minutesAgo(2 * 60 + 14) }),
          status: await clockActivityStatus(),
        }))}
      >
        Clock activity: entry A (since 2 h 14 min ago)
      </button>
      <button
        className={button}
        onClick={run("clock entry B (just now)", async () => ({
          result: await syncClockActivity({ id: "test-entry-b", startedAt: minutesAgo(0) }),
          status: await clockActivityStatus(),
        }))}
      >
        Clock activity: entry B (just now)
      </button>
      <button className={button} onClick={run("shortcut", () => takeShortcutPath())}>
        Take the page a quick action or t2q:// link asked for
      </button>
      <button
        className={button}
        onClick={run("clock end", async () => {
          await endClockActivity();
          return clockActivityStatus();
        })}
      >
        Clock activity: end
      </button>
    </main>
  );
}
