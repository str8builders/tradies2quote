import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/ui/top-bar";

/**
 * Fast loading state for `/app/quotes/new`.
 *
 * Kept route-local so tapping "New quote" gets an immediate, useful loading
 * screen while the auth/subscription gate resolves, without bringing the
 * heavier app splash back between every /app tab.
 *
 * A loading file can't ask which look is on, so this is drawn once, in ui-
 * tokens, and reads right in both shells, dark or outdoor: it paints its own
 * ui background, so words and page always flip together. It mirrors the new
 * flow's first screen (FlowFrame + the three ways in) so nothing jumps when
 * the flow arrives. The top bar shows only inside the new-look shell
 * (`data-look="new"`), where the flow's own bar replaces it; the old page
 * brings its own header.
 */
export default function NewQuoteLoading() {
  return (
    <Screen data-new-quote-screen="loading">
      <div className="sticky top-[env(safe-area-inset-top)] z-20 hidden sm:static [[data-look=new]_&]:block">
        <TopBar title="New quote" safeArea={false} back={{ href: "/app", label: "Cancel" }} />
      </div>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-5 pb-8">
        <div data-testid="new-quote-loading" role="status" aria-live="polite">
          <h2 className="ui-heading text-ui-2xl text-ui-text">Getting ready…</h2>
          <p className="mt-2 flex items-center gap-2 text-ui-base text-ui-muted">
            <SpinnerGap
              aria-hidden="true"
              weight="bold"
              className="shrink-0 animate-spin text-[1.25rem] text-ui-brand-text motion-reduce:animate-none"
            />
            Checking your account and warming up the recorder.
          </p>
        </div>
        <ul aria-hidden="true" className="space-y-3">
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              className="flex min-h-20 items-center gap-4 rounded-ui-lg border-2 border-ui-line bg-ui-surface px-4 py-3 shadow-ui-card"
            >
              <Skeleton className="h-12 w-12 shrink-0" />
              <span className="min-w-0 flex-1 space-y-2">
                <Skeleton shape="line" className="w-2/5" />
                <Skeleton shape="line" className="w-4/5" />
              </span>
            </li>
          ))}
        </ul>
      </main>
    </Screen>
  );
}
