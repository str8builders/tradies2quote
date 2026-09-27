import { Lock } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { HOME_PATH } from "@/app/app/_v2/lib/app-nav";
import type { WeatherImpactProps } from "../_components/WeatherImpactClient";
import { WeatherImpact } from "./WeatherImpact";

/**
 * /app/weather in the new look: the title with a way back Home (the /app
 * shell pads the notch), then the check for the picked job's site. Parked
 * behind the rollout gate for this account, it says so instead.
 */
export function WeatherScreen({ enabled, ...props }: WeatherImpactProps & { enabled: boolean }) {
  return (
    <Screen data-testid="weather-screen">
      <TopBar title="Weather impact" back={{ href: HOME_PATH, label: "Home" }} safeArea={false} />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
        {enabled ? (
          <WeatherImpact {...props} />
        ) : (
          <div data-testid="weather-parked">
            <EmptyState
              icon={<Lock weight="duotone" />}
              title="Weather impact is in owner testing"
              action={
                <ButtonLink href={HOME_PATH} variant="secondary" fullWidth>
                  Back to Home
                </ButtonLink>
              }
            >
              It stays off until the rules and wording have been checked on real jobs.
            </EmptyState>
          </div>
        )}
      </div>
    </Screen>
  );
}
