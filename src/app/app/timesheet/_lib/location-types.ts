import type { JobSite } from "@/lib/location/geo";

/** What the Timesheet knows about your location setting and your day. */
export interface LocationState {
  /** Your account: the iPhone app ties its upload key, route and arrivals to it. */
  userId: string;
  consent: {
    granted: boolean;
    autoClock: boolean;
    workStart: string;
    workEnd: string;
    workDays: number[];
  };
  /** You're clocked in (since, where). */
  open: {
    id: string;
    startedAt: string;
    place: string | null;
    clientId: string | null;
    clientName: string | null;
    source: "tap" | "auto";
  } | null;
  /** The business's job sites (for "At the … job"). */
  sites: JobSite[];
  /** The ones the phone watches for automatic clock-in (iOS: up to 20). */
  geofences: JobSite[];
  /** IANA zone of the business (its saved zone, else its country's), for clocking out and work hours. */
  timeZone: string;
}

export const DEFAULT_CONSENT: LocationState["consent"] = {
  granted: false,
  autoClock: false,
  workStart: "05:00",
  workEnd: "19:00",
  workDays: [1, 2, 3, 4, 5, 6],
};
