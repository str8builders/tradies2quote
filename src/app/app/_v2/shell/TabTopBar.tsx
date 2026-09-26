import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { UI_TEXT } from "@/components/ui/styles";
import type { TopBarData } from "../lib/top-bar";
import { AccountButton } from "./AccountButton";
import { SettingsTip } from "./SettingsTip";
import { WeatherButton } from "./WeatherButton";
import type { WeatherState } from "./weather-now";

export interface TabTopBarProps {
  data: TopBarData;
  /** The tab's name ("Jobs"). Leave out on Home, which greets you instead. */
  title?: string;
  /** A line of plain words under the bar. */
  description?: ReactNode;
  /** Sample weather for the local preview page (the app looks it up itself). */
  weatherPreview?: WeatherState;
}

/**
 * The top of every main tab (Home, Jobs, Prices, Timesheet): your photo on
 * the left (a tap opens the menu with everything else), the page's heading
 * beside it, and the weather on the right (when weather impact is on for
 * the account). On Home the heading is the greeting: "Good morning,"
 * over your name, or just "Good morning" when there's no name to use.
 * Holds the page's one h1.
 */
export function TabTopBar({ data, title, description, weatherPreview }: TabTopBarProps) {
  const greeting = !title;
  return (
    <header data-testid="tab-top-bar" className={cx("space-y-2", UI_TEXT)}>
      <div className="flex items-center gap-3">
        <AccountButton data={data} />
        <div className="min-w-0 flex-1">
          {greeting && data.name ? (
            <h1 className="leading-tight">
              <span className="block text-ui-sm text-ui-muted">{data.greeting},</span>
              <span className="ui-heading block truncate text-ui-xl text-ui-text">{data.name}</span>
            </h1>
          ) : (
            <h1 className="ui-heading truncate text-ui-2xl text-ui-text">{greeting ? data.greeting : title}</h1>
          )}
        </div>
        {data.weather ? <WeatherButton preview={weatherPreview} /> : null}
      </div>
      {description ? <p className="text-ui-base text-ui-muted">{description}</p> : null}
      {/* Home only: a one-time pointer to the settings behind the photo. */}
      {greeting ? <SettingsTip /> : null}
    </header>
  );
}
