import { notFound } from "next/navigation";
import { AppNav } from "@/app/app/_v2/shell/AppNav";
import { NewLookWelcome } from "@/app/app/_v2/shell/NewLookWelcome";
import { TabTopBar } from "@/app/app/_v2/shell/TabTopBar";
import { HomeView } from "@/app/app/_v2/home/HomeParts";
import { WeatherLineView } from "@/app/app/_v2/home/WeatherLine";
import { TOP_BAR_FIXTURE } from "@/app/app/_v2/lib/fixtures";
import type { MoneyTotal, Todo } from "@/app/app/_v2/lib/home-todos";
import type { JobRow } from "@/app/app/_v2/lib/job-board";
import { JobsBrowser } from "@/app/app/jobs/_components/JobsBrowser";
import { MoreView } from "@/app/app/more/_components/MoreView";
import { contrastAttributeValue } from "@/lib/ui/outdoor";
import { TimesheetView } from "@/app/app/timesheet/_components/TimesheetView";
import type { WeatherState } from "@/app/app/_v2/shell/weather-now";
import type { TimesheetData } from "@/app/app/timesheet/_lib/types";
import { ForgetWelcome } from "./ForgetWelcome";
import { NativeTest } from "./NativeTest";
import { TalkLive } from "./TalkLive";
import { TalkPreview } from "./TalkPreview";

export const dynamic = "force-dynamic";

const bar = {
  ...TOP_BAR_FIXTURE,
  name: "Challis",
  letter: "C",
  businessName: "STR8 Builders",
  email: "challis@example.test",
  weather: true,
};

/** Made-up weather for the top bar's button and its sheet. */
const weather: WeatherState = {
  kind: "ready",
  today: "2026-09-26",
  reading: {
    source: "device",
    key: "-37.69,176.17",
    locality: null,
    at: Date.parse("2026-09-26T08:00:00+12:00"),
    weather: {
      current: { summary: "Mostly clear", condition: "clear", temperatureC: 17.2, windGustKph: 24, rainProbabilityPct: 10 },
      days: [
        { date: "2026-09-26", status: "safe", condition: "clear", tempMaxC: 18, rainProbabilityMaxPct: 10, windGustMaxKph: 24, reason: "Good to work" },
        { date: "2026-09-27", status: "caution", condition: "rain", tempMaxC: 15, rainProbabilityMaxPct: 70, windGustMaxKph: 38, reason: "Showers from midday" },
        { date: "2026-09-28", status: "safe", condition: "cloud", tempMaxC: 16, rainProbabilityMaxPct: 20, windGustMaxKph: 22, reason: "Good to work" },
        { date: "2026-09-29", status: "safe", condition: "clear", tempMaxC: 19, rainProbabilityMaxPct: 5, windGustMaxKph: 18, reason: "Good to work" },
        { date: "2026-09-30", status: "caution", condition: "rain", tempMaxC: 14, rainProbabilityMaxPct: 60, windGustMaxKph: 30, reason: "Rain likely" },
      ],
      trades: [
        { id: "general_outdoor", label: "General outdoor labour", status: "safe", reason: "No weather limits right now.", betterWindow: null },
        { id: "roofing", label: "Roofing", status: "caution", reason: "Gusts near 25 kph: take care on the roof edge.", betterWindow: "Sat 2:00 pm-Sat 4:00 pm looks better: gusts around 15 kph." },
        { id: "painting_exterior", label: "Painting (exterior)", status: "safe", reason: "No weather limits right now.", betterWindow: null },
      ],
    },
  },
};

const todos: Todo[] = [
  {
    key: "draft:1",
    kind: "draft",
    title: "Quote ready to send",
    detail: "Hemi Walker · Deck rebuild · $6,240.00",
    action: { label: "Check and send", href: "#" },
    tone: "brand",
  },
  {
    key: "invoice:2",
    kind: "invoice",
    title: "Job done, time to invoice",
    detail: "K. Patel · Bathroom reno · $3,640.00",
    action: { label: "Send invoice", href: "#" },
    tone: "ok",
  },
  {
    key: "overdue:3",
    kind: "overdue",
    title: "$1,180.00 is 9 days late",
    detail: "Sarah Tane · Fence repair",
    action: { label: "Send a reminder", href: "#" },
    tone: "bad",
  },
  {
    key: "book:4",
    kind: "book",
    title: "Accepted, not booked",
    detail: "M. Rangi · Pergola",
    action: { label: "Book the job", href: "#" },
    tone: "info",
  },
];
const owed: MoneyTotal = {
  amount: 4820,
  count: 3,
  currency: "NZD",
  otherCurrencies: 0,
};
const paid: MoneyTotal = {
  amount: 12460,
  count: 5,
  currency: "NZD",
  otherCurrencies: 0,
};

const job = (
  id: string,
  client: string,
  jobText: string,
  amount: number,
  pill: JobRow["pill"],
  filter: JobRow["filter"],
): JobRow => ({
  id,
  href: "#",
  client,
  job: jobText,
  amount,
  currency: "NZD",
  pill,
  filter,
  archived: false,
  rank: 0,
});
const rows: JobRow[] = [
  job(
    "1",
    "Hemi Walker",
    "Deck rebuild, 14 Kauri St",
    6240,
    { text: "Draft", tone: "neutral" },
    "to-send",
  ),
  job(
    "2",
    "K. Patel",
    "Bathroom reno",
    3640,
    { text: "Job done", tone: "ok" },
    "unpaid",
  ),
  job(
    "3",
    "Sarah Tane",
    "Fence repair",
    1180,
    { text: "9 days late", tone: "bad" },
    "unpaid",
  ),
  job(
    "4",
    "M. Rangi",
    "Pergola, 4 × 3 m",
    8950,
    { text: "Viewed", tone: "info" },
    "waiting",
  ),
  job(
    "5",
    "J. Dunn",
    "Kitchen framing",
    12300,
    { text: "Booked Tue 30 Sept", tone: "info" },
    "booked",
  ),
  job(
    "6",
    "Aroha Ngata",
    "Retaining wall",
    5400,
    { text: "Paid", tone: "ok" },
    "done",
  ),
];

const timesheet: TimesheetData = {
  weekStart: "2026-09-21",
  today: "2026-09-23",
  entries: [
    {
      id: "e1",
      workDate: "2026-09-21",
      start: "07:00",
      finish: "15:30",
      breakMinutes: 30,
      hours: 8,
      note: "Deck framing",
      clientId: "c1",
      clientName: "Hemi Walker",
      userId: "me",
      person: "You",
      mine: true,
      invoice: null,
      pins: { start: "At the Hemi Walker job", end: "At the Hemi Walker job" },
      km: 12.4,
      site: { lat: -37.6868, lng: 176.1654, address: "14 Kauri Street, Tauranga" }, address: null,
      clockPoints: { start: { lat: -37.6866, lng: 176.1657 }, end: { lat: -37.6869, lng: 176.1652 } },
    },
    {
      id: "e2",
      workDate: "2026-09-21",
      start: "07:30",
      finish: "15:30",
      breakMinutes: 30,
      hours: 7.5,
      note: null,
      clientId: "c1",
      clientName: "Hemi Walker",
      userId: "s",
      person: "Sione",
      mine: false,
      invoice: null, pins: null, km: null,
      site: { lat: -37.6868, lng: 176.1654, address: "14 Kauri Street, Tauranga" }, address: null,
    },
    {
      id: "e3",
      workDate: "2026-09-22",
      start: "06:45",
      finish: "15:05",
      breakMinutes: 20,
      hours: 8,
      note: "Joists and bearers",
      clientId: "c1",
      clientName: "Hemi Walker",
      userId: "me",
      person: "You",
      mine: true,
      invoice: null, pins: null, km: null
    },
    {
      id: "e4",
      workDate: "2026-09-23",
      start: "08:00",
      finish: "12:00",
      breakMinutes: 0,
      hours: 4,
      note: "Bathroom lining",
      clientId: "c2",
      clientName: "K. Patel",
      userId: "me",
      person: "You",
      mine: true,
      invoice: { id: "i1", number: "INV-3F9A21C0" }, pins: null, km: null
    },
  ],
  clients: [
    {
      id: "c1",
      name: "Hemi Walker",
      email: "hemi@example.test",
      address: null,
      phone: null,
    },
    { id: "c2", name: "K. Patel", email: null, address: null, phone: null },
  ],
  canInvoice: true,
  people: [
    { userId: "me", name: "You" },
    { userId: "s", name: "Sione" },
  ],
  labourRate: 85,
  currency: "NZD",
  taxLabel: "GST",
  taxRate: 15,
  failed: false,
  travelRate: null,
};

/**
 * Local-only look at the round-two new-look screens with made-up data
 * (?screen=home|jobs|more|timesheet|talk|recording|talk-live|welcome,
 * &outdoor=1). talk-live is the real recorder and meter (for trying the mic
 * in the iOS Simulator). Never served
 * in production.
 */
export default async function DevNewLookPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; outdoor?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen = "home", outdoor } = await searchParams;
  const main = "mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10";
  let content;
  if (screen === "jobs") {
    content = (
      <main className={main}>
        <TabTopBar
          data={bar}
          weatherPreview={weather}
          title="Jobs"
          description="Every quote, from first draft to paid."
        />
        <JobsBrowser rows={rows} />
      </main>
    );
  } else if (screen === "more") {
    content = (
      <MoreView
        bar={bar}
        isOwner={false}
        outdoor={outdoor === "1"}
        canChooseLook={false}
      />
    );
  } else if (screen === "timesheet") {
    content = (
      <main className={main}>
        <TabTopBar
          data={bar}
          weatherPreview={weather}
          title="Timesheet"
          description="Everyone's hours, and invoice a client for the week."
        />
        <TimesheetView data={timesheet} />
      </main>
    );
  } else if (screen === "native") {
    content = <NativeTest />;
  } else if (screen === "talk-live") {
    content = <TalkLive />;
  } else if (screen === "talk" || screen === "recording") {
    content = (
      <TalkPreview phase={screen === "recording" ? "recording" : "idle"} />
    );
  } else {
    content = (
      <main className={main}>
        <TabTopBar data={bar} weatherPreview={weather} />
        <div className="mt-5">
          <HomeView
            summary="4 things need you today"
            weather={
              <WeatherLineView
                line={{
                  text: "Tauranga today: good to work · 14°",
                  tone: "ok",
                  condition: "clear",
                }}
                href={null}
                variant="chip"
              />
            }
            setup={null}
            todos={todos}
            hasJobs
            tiles={{ owed, paidThisMonth: paid }}
            failed={false}
            t2qcal
          />
        </div>
      </main>
    );
  }
  return (
    <>
      {screen === "welcome" ? <ForgetWelcome /> : null}
      {screen === "welcome" ? (
        <NewLookWelcome
          serverOpen
          data={{
            greeting: "Good morning",
            name: "Challis",
            today: "Saturday 26 September",
          }}
        />
      ) : null}
      <div
        data-shell="app"
        data-theme="dark"
        data-look="new"
        data-contrast-root=""
        data-contrast={contrastAttributeValue(outdoor === "1")}
        className="studio-app t2q-app-canvas min-h-dvh w-full max-w-full overflow-x-clip bg-ui-bg!"
      >
        <div className="t2q-app-scroll min-w-0 sm:pl-[calc(6rem+env(safe-area-inset-left))]">
          {content}
        </div>
        {screen.startsWith("talk") || screen === "recording" ? null : (
          <AppNav />
        )}
      </div>
    </>
  );
}
