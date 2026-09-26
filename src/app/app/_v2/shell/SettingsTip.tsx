"use client";

import { useEffect, useState } from "react";
import { GearSix } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

/** Remembered on this phone once the menu has been opened or the tip dismissed. */
export const SETTINGS_TIP_KEY = "t2q-settings-tip-seen";
/** Opens the photo menu from anywhere on the page. */
export const OPEN_ACCOUNT_EVENT = "t2q:open-account";
const SEEN_EVENT = "t2q:settings-tip-seen";

/** The tip has done its job: never show it again on this phone. */
export function markSettingsTipSeen(): void {
  try {
    window.localStorage.setItem(SETTINGS_TIP_KEY, "1");
  } catch {
    // Blocked storage: it just shows again next visit.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** The tip itself (no storage), pointing up at the photo on the left. */
export function SettingsTipView({ onShow, onDismiss }: { onShow: () => void; onDismiss: () => void }) {
  return (
    <div role="note" data-testid="settings-tip" className="relative rounded-ui-md border border-ui-line bg-ui-surface p-3">
      <span aria-hidden="true" className="absolute -top-2 left-4 h-4 w-4 rotate-45 border-t border-l border-ui-line bg-ui-surface" />
      <div className="flex items-start gap-3">
        <GearSix aria-hidden="true" weight="duotone" className="mt-0.5 shrink-0 text-[1.375rem] text-ui-brand-text" />
        <p className="text-ui-base text-ui-text">Your settings, business details and more are behind your photo.</p>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onShow}>
          Show me
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}

/**
 * A one-time pointer to the photo menu on Home, for people who don't know
 * the photo opens settings. Gone for good on this phone once they open the
 * menu (from here or the photo) or tap "Got it".
 */
export function SettingsTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Read after mount (storage isn't there on the server), off the effect body.
    const t = window.setTimeout(() => {
      let seen = false;
      try {
        seen = window.localStorage.getItem(SETTINGS_TIP_KEY) === "1";
      } catch {
        seen = false;
      }
      if (!seen) setShow(true);
    }, 0);
    const hide = () => setShow(false);
    window.addEventListener(SEEN_EVENT, hide);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(SEEN_EVENT, hide);
    };
  }, []);

  if (!show) return null;
  return <SettingsTipView onShow={() => window.dispatchEvent(new Event(OPEN_ACCOUNT_EVENT))} onDismiss={markSettingsTipSeen} />;
}
