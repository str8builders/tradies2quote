import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { ActivationSection, StuckPerson } from "@/lib/admin/activation";

/**
 * The owner's activation view: how far each person who signed up got (set up
 * the business, made a quote, sent it, had it accepted), and who stopped
 * where, so a message from you can reach them. Read-only. The numbers are
 * built by src/lib/admin/activation.ts.
 */

export function formatDays(days: number): string {
  if (days <= 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

/** Hours as a person would say them: "18 min", "3.2 h", "4 days". */
export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} days`;
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="t2q-card-pro p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">{label}</p>
      <p className="mt-1 font-display text-2xl tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

function StuckList({
  testId,
  title,
  people,
  empty,
  since,
}: {
  testId: string;
  title: string;
  people: readonly StuckPerson[];
  empty: string;
  since: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="t2q-section-label-pro mb-2">{`// ${title}`}</p>
      {people.length === 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {people.map((p) => (
            <li
              key={p.email}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
            >
              <span className="min-w-0 truncate text-white">{p.email}</span>
              <span className="shrink-0 text-xs text-amber-600">
                {p.quotes > 0 ? `${p.quotes === 1 ? "1 quote" : `${p.quotes} quotes`} · ` : ""}
                {formatDays(p.days)} {since}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActivationPanel({ activation: a }: { activation: ActivationSection }) {
  if (a.error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
        <WarningCircle size={18} weight="bold" />
        {a.error}
      </div>
    );
  }
  const signedUp = a.steps[0]?.count ?? 0;
  if (signedUp === 0) {
    return (
      <div className="rounded-lg border border-ink-700/50 bg-ink-900/30 px-4 py-3 text-sm text-ink-400">
        No customers yet. Your own and the App Review accounts aren&apos;t counted.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <ol data-testid="activation-funnel" className="t2q-card-pro space-y-4 p-4">
        {a.steps.map((step) => (
          <li key={step.id} data-step={step.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-white">{step.label}</span>
              <span className="shrink-0 font-semibold text-white">
                {step.count}
                <span className="ml-2 text-xs font-normal text-ink-400">{percent(step.share)}</span>
              </span>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink-700/50">
              <div className="h-full bg-brand" style={{ width: percent(step.share) }} />
            </div>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Quoting this week" value={String(a.activeThisWeek)} hint="made a quote in the last 7 days" />
        <Tile label="Time to first quote" value={formatHours(a.medianHoursToFirstQuote)} hint="median, from signing up" />
      </div>

      <StuckList
        testId="activation-no-quote"
        title="signed up, never made a quote"
        people={a.stuckNoQuote}
        empty="Everyone who signed up over a day ago has made a quote."
        since="since signing up"
      />
      <StuckList
        testId="activation-not-sent"
        title="made a quote, never sent one"
        people={a.quotedNotSent}
        empty="Everyone who made a quote has sent one."
        since="since the first"
      />

      {a.excluded > 0 ? (
        <p className="text-xs text-ink-500">
          Not counted: {a.excluded === 1 ? "1 internal account" : `${a.excluded} internal accounts`} (yours and the App Review demo).
        </p>
      ) : null}
    </div>
  );
}
