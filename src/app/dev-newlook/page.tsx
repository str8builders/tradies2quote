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
import { TalkPreview } from "./TalkPreview";

export const dynamic = "force-dynamic";

const bar = { ...TOP_BAR_FIXTURE, name: "Challis", letter: "C", businessName: "STR8 Builders", email: "challis@example.test" };

const todos: Todo[] = [
  { key: "draft:1", kind: "draft", title: "Quote ready to send", detail: "Hemi Walker · Deck rebuild · $6,240.00", action: { label: "Check and send", href: "#" }, tone: "brand" },
  { key: "invoice:2", kind: "invoice", title: "Job done, time to invoice", detail: "K. Patel · Bathroom reno · $3,640.00", action: { label: "Send invoice", href: "#" }, tone: "ok" },
  { key: "overdue:3", kind: "overdue", title: "$1,180.00 is 9 days late", detail: "Sarah Tane · Fence repair", action: { label: "Send a reminder", href: "#" }, tone: "bad" },
  { key: "book:4", kind: "book", title: "Accepted, not booked", detail: "M. Rangi · Pergola", action: { label: "Book the job", href: "#" }, tone: "info" },
];
const owed: MoneyTotal = { amount: 4820, count: 3, currency: "NZD", otherCurrencies: 0 };
const paid: MoneyTotal = { amount: 12460, count: 5, currency: "NZD", otherCurrencies: 0 };

const job = (id: string, client: string, jobText: string, amount: number, pill: JobRow["pill"], filter: JobRow["filter"]): JobRow => ({
  id, href: "#", client, job: jobText, amount, currency: "NZD", pill, filter, archived: false, rank: 0,
});
const rows: JobRow[] = [
  job("1", "Hemi Walker", "Deck rebuild, 14 Kauri St", 6240, { text: "Draft", tone: "neutral" }, "to-send"),
  job("2", "K. Patel", "Bathroom reno", 3640, { text: "Job done", tone: "ok" }, "unpaid"),
  job("3", "Sarah Tane", "Fence repair", 1180, { text: "9 days late", tone: "bad" }, "unpaid"),
  job("4", "M. Rangi", "Pergola, 4 × 3 m", 8950, { text: "Viewed", tone: "info" }, "waiting"),
  job("5", "J. Dunn", "Kitchen framing", 12300, { text: "Booked Tue 30 Sept", tone: "info" }, "booked"),
  job("6", "Aroha Ngata", "Retaining wall", 5400, { text: "Paid", tone: "ok" }, "done"),
];

/**
 * Local-only look at the round-two new-look screens with made-up data
 * (?screen=home|jobs|more|talk|recording|welcome, &outdoor=1). Never served
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
        <TabTopBar data={bar} title="Jobs" description="Every quote, from first draft to paid." />
        <JobsBrowser rows={rows} />
      </main>
    );
  } else if (screen === "more") {
    content = <MoreView bar={bar} isOwner={false} outdoor={outdoor === "1"} canChooseLook={false} />;
  } else if (screen === "talk" || screen === "recording") {
    content = <TalkPreview phase={screen === "recording" ? "recording" : "idle"} />;
  } else {
    content = (
      <main className={main}>
        <TabTopBar data={bar} />
        <div className="mt-5">
          <HomeView
            summary="4 things need you today"
            weather={
              <WeatherLineView line={{ text: "Tauranga today: good to work · 14°", tone: "ok", condition: "clear" }} href={null} variant="chip" />
            }
            setup={null}
            todos={todos}
            hasJobs
            tiles={{ owed, paidThisMonth: paid }}
            failed={false}
          />
        </div>
      </main>
    );
  }
  return (
    <div
      data-shell="app"
      data-theme="dark"
      data-look="new"
      data-contrast-root=""
      data-contrast={contrastAttributeValue(outdoor === "1")}
      className="studio-app t2q-app-canvas min-h-dvh w-full max-w-full overflow-x-clip bg-ui-bg!"
    >
      <div className="t2q-app-scroll min-w-0 sm:pl-[calc(6rem+env(safe-area-inset-left))]">{content}</div>
      {screen === "talk" || screen === "recording" ? null : <AppNav />}
      {screen === "welcome" ? <NewLookWelcome serverOpen data={{ greeting: "Good morning", name: "Challis", today: "Saturday 26 September" }} /> : null}
    </div>
  );
}
