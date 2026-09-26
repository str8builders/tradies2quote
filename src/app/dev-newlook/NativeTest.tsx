"use client";

import { useState } from "react";
import { hasNativeLocation, nativeLocation } from "@/lib/location/device";

/** Local only: drive the iPhone app's T2QLocation module by hand (simulator testing). */
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
      <pre data-testid="native-log" className="text-ui-xs whitespace-pre-wrap text-ui-text">{log.join("\n")}</pre>
    </main>
  );
}
