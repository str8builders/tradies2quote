import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/**
 * Shown instead of a form when the profile could not be read: saving over a
 * failed read would replace real details with blanks (see load.ts). The
 * retry is a full page load.
 */
export function LoadFailed({ retryHref }: { retryHref: string }) {
  return (
    <Callout
      tone="bad"
      title="Couldn't load your settings"
      action={
        <a href={retryHref} className={buttonClasses({ variant: "secondary" })} data-testid="settings-load-retry">
          <ArrowClockwise aria-hidden="true" weight="bold" className="text-[1.15em]" />
          <span>Try again</span>
        </a>
      }
    >
      Nothing has been changed. Check your signal, then try again.
    </Callout>
  );
}
