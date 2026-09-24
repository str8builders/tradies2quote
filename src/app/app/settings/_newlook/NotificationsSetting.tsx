"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Toggle } from "@/components/ui/toggle";
import { isNativeIOSApp } from "@/lib/native-app";
import { disablePush, enablePush, pushCanToggle, pushStatusText, readPushState, type PushState } from "./push";

const emptySubscribe = () => () => {};

/**
 * Quote notifications for this phone: a buzz when a client accepts a quote.
 * Web Push in the browser and the Home Screen app, Apple push in the iOS app.
 */
export function NotificationsSetting() {
  const native = useSyncExternalStore(emptySubscribe, isNativeIOSApp, () => false);
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    let cancelled = false;
    void readPushState(native).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [native]);

  const flip = async (next: boolean) => {
    setState("working");
    setState(next ? await enablePush(native) : await disablePush(native));
  };

  return (
    <div data-testid="settings-notifications" data-state={state}>
      <Toggle
        label="Quote notifications"
        description={pushStatusText(state)}
        checked={state === "on"}
        disabled={!pushCanToggle(state)}
        onChange={(next) => void flip(next)}
      />
    </div>
  );
}
