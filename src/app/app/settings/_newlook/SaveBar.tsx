"use client";

import { FloppyDisk } from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { saveBarState } from "./model";

/**
 * The one big Save button, at the thumb, only while something has changed.
 *
 * Fixed rather than sticky: on phones it docks just above the floating
 * bottom nav, at the height the mobile shell contract gives fixed bars
 * (5.3rem + the home-indicator inset, docs/mobile-shell-contract.md); from
 * `sm` up there is no bottom nav and it sits on the bottom edge. It slides
 * in with opacity and transform only, and not at all for reduced motion.
 */
export function SaveBar({
  dirty,
  pending,
  onSave,
}: {
  dirty: boolean;
  pending: boolean;
  /** Without it the button submits its form (so the phone's Go key saves too). */
  onSave?: () => void;
}) {
  const bar = saveBarState({ dirty, pending });
  if (!bar.visible) return null;
  return (
    <div
      data-testid="settings-save-bar"
      className="fixed inset-x-0 bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))] z-30 animate-ui-toast-in motion-reduce:animate-none sm:bottom-0 sm:bg-ui-bg sm:pb-[env(safe-area-inset-bottom)]"
    >
      <BottomActionBar safeArea={false}>
        <Button
          fullWidth
          loading={pending}
          loadingLabel={bar.label}
          icon={<FloppyDisk weight="bold" />}
          type={onSave ? "button" : "submit"}
          onClick={onSave}
          data-testid="settings-save"
        >
          Save
        </Button>
      </BottomActionBar>
    </div>
  );
}
