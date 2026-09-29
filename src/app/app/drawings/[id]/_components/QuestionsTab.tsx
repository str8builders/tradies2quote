"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { PlanSetView } from "@/lib/planset/api-types";
import type { ResolvedFlag } from "@/lib/planset/model/answers";
import { QuestionInput, firstEvidence, saveAnswers } from "./parts";

const GROUPS: Array<{ level: ResolvedFlag["level"]; title: string; tone: "bad" | "warn" | "info" }> = [
  { level: "blocker", title: "Needs an answer before the materials", tone: "bad" },
  { level: "check", title: "Check these", tone: "warn" },
  { level: "info", title: "Good to know", tone: "info" },
];

/** Everything the reader wants the tradie to look at, and the questions for the designer. */
export function QuestionsTab({ setId, view, onSaved, onShow }: { setId: string; view: PlanSetView; onSaved: () => void; onShow: (page: number, text?: number[]) => void }) {
  const flags = view.model!.flags;
  const rfis = flags.filter((f) => f.rfi && !f.resolved);
  const [copied, setCopied] = useState(false);

  const rfiText = rfis.map((f, i) => `${i + 1}. ${f.rfi}`).join("\n");

  return (
    <div className="space-y-5" data-testid="planset-questions">
      {!flags.length ? <Callout tone="ok">Nothing to check — every cross-check on these plans agreed.</Callout> : null}
      {GROUPS.map((g) => {
        const list = flags.filter((f) => f.level === g.level);
        if (!list.length) return null;
        return (
          <section key={g.level} className="space-y-2" aria-label={g.title}>
            <h2 className="text-ui-sm font-semibold text-ui-muted">{g.title}</h2>
            <Card padding="none">
              <ul className="divide-y divide-ui-line">
                {list.map((f) => {
                  const ev = firstEvidence(f.evidence);
                  return (
                    <li key={f.id} className="space-y-3 px-4 py-3" data-testid={`flag-${f.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-ui-base text-ui-text">{f.message}</p>
                        {f.resolved ? <StatusPill tone="ok">Answered</StatusPill> : <StatusPill tone={g.tone}>{g.level === "blocker" ? "Answer" : g.level === "check" ? "Check" : "Note"}</StatusPill>}
                      </div>
                      {ev ? (
                        <button type="button" className="text-ui-sm font-semibold text-ui-brand-text" onClick={() => onShow(ev.page, ev.text)}>
                          Show on plan
                        </button>
                      ) : null}
                      {f.question && !f.resolved ? (
                        <QuestionInput
                          question={f.question}
                          onAnswer={async (v) => {
                            const problem = await saveAnswers(setId, { [`flag:${f.id}`]: v });
                            if (!problem) onSaved();
                            return problem;
                          }}
                        />
                      ) : null}
                      {f.resolved && f.answer !== undefined ? (
                        <div className="flex items-center gap-3 text-ui-sm text-ui-muted">
                          <span>Your answer: {String(f.answer === true ? "Yes" : f.answer === false ? "No" : f.answer)}</span>
                          <button
                            type="button"
                            className="font-semibold text-ui-brand-text"
                            onClick={async () => {
                              const problem = await saveAnswers(setId, { [`flag:${f.id}`]: null });
                              if (!problem) onSaved();
                            }}
                          >
                            Change
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        );
      })}

      {rfis.length ? (
        <section className="space-y-2" aria-label="Questions for the designer">
          <h2 className="text-ui-sm font-semibold text-ui-muted">Questions for the designer ({rfis.length})</h2>
          <Card padding="md" className="space-y-3">
            <pre className="whitespace-pre-wrap font-sans text-ui-sm text-ui-text">{rfiText}</pre>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`Questions about the plans (${view.name}):\n${rfiText}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy them"}
            </Button>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
