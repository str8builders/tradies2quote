import {
  Lifebuoy,
  PaperPlaneTilt,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import {
  runFollowupAgent,
  type FollowupContext,
} from "@/lib/agents/followup";
import {
  logAgentRunStart,
  logAgentRunFinish,
  newRunId,
} from "@/lib/agent-monitor/logger";
import { CopyButton } from "./CopyButton";
import { FollowupAgentV2 } from "./FollowupAgentV2";

/**
 * Follow-up Agent — server component that pre-computes 4 templates
 * (friendly reminder, price clarification, acceptance nudge, missing
 * info) for a single quote and renders each with a Copy button.
 *
 * Read-only. Does NOT send anything. Copy → paste into your own email
 * or SMS app. The "applies" flag on each template hides ones that
 * don't make sense for the current quote state (e.g. no follow-up on
 * a quote that hasn't been sent yet).
 *
 * `look="new"` draws the same messages with the kit (FollowupAgentV2) for
 * the new-look job page.
 */
interface Props extends FollowupContext {
  /** When true, render only templates that apply to the current state. */
  hideInapplicable?: boolean;
  look?: "classic" | "new";
}

export function FollowupAgent(props: Props) {
  const messages = runFollowupAgent(props);
  const filtered = props.hideInapplicable
    ? messages.filter((m) => m.applies)
    : messages;
  // Surface the message the agent recommends sending right now at the
  // top of the list — that's the whole point of the panel.
  const visible = [...filtered].sort(
    (a, b) => Number(b.recommended) - Number(a.recommended),
  );

  // Telemetry — fire-and-forget, never throws, never blocks the render.
  try {
    const runId = newRunId("fup");
    logAgentRunStart({
      agentName: "Follow-up Agent",
      runId,
      stepName: "run.start",
      status: "running",
      message: "Generating follow-up message templates",
    });
    logAgentRunFinish({
      agentName: "Follow-up Agent",
      runId,
      stepName: "run.finish",
      status: "complete",
      message: `${visible.length} of ${messages.length} follow-up template(s) apply`,
    });
  } catch {
    // Telemetry failures must never break the page render.
  }

  if (props.look === "new") return <FollowupAgentV2 messages={visible} />;

  return (
    <section
      data-testid="agent-followup"
      className="t2q-card-pro mb-6 p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
        >
          <Lifebuoy size={20} weight="bold" />
        </span>
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
            Follow-up Agent.
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300">
            {"// read-only · tells you which message to send, and when"}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p
          data-testid="agent-followup-empty"
          className="mt-5 rounded-sm border border-dashed border-ink-700 bg-ink-800/40 p-5 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          {"// no follow-up templates apply yet — send the quote first"}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {visible.map((m) => (
            <li
              key={m.id}
              data-testid={`agent-followup-${m.id}`}
              data-applies={m.applies}
              data-recommended={m.recommended}
              className={`rounded-sm border p-4 ${
                m.recommended
                  ? "border-brand bg-brand/5"
                  : m.applies
                    ? "border-ink-700 bg-ink-900/40"
                    : "border-ink-700/50 bg-ink-900/40 opacity-70"
              }`}
            >
              {m.recommended ? (
                <p
                  data-testid="agent-followup-recommended"
                  className="mb-2 inline-flex items-center gap-1.5 rounded-sm bg-brand px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-900"
                >
                  <PaperPlaneTilt size={12} weight="bold" />
                  Send this now
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-sm uppercase tracking-tight text-white">
                    {m.label}
                  </p>
                  {m.recommended && m.timingHint ? (
                    <p className="mt-0.5 text-xs text-brand">{m.timingHint}</p>
                  ) : null}
                  {!m.applies && m.whyNotApply ? (
                    <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                      <WarningOctagon size={12} weight="bold" />
                      {m.whyNotApply}
                    </p>
                  ) : null}
                </div>
                <CopyButton
                  text={m.body}
                  label="Copy"
                  testId={`copy-followup-${m.id}`}
                  disabled={!m.applies}
                />
              </div>
              <pre className="mt-3 whitespace-pre-wrap rounded-sm border border-ink-700/60 bg-ink-900/60 p-3 text-sm leading-relaxed text-ink-100 font-sans">
                {m.body}
              </pre>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {"// the agent never emails or texts — you stay in control"}
      </p>
    </section>
  );
}
