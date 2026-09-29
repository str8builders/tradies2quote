"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import type { Evidence } from "@/lib/planset/types";
import type { Fact, FactStatus, Question } from "@/lib/planset/model/types";

export async function saveAnswers(setId: string, answers: Record<string, string | number | boolean | null>): Promise<string | null> {
  const res = await fetch(`/api/plansets/${setId}/answers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Couldn't save that. Try again.";
}

const STATUS: Record<FactStatus, { tone: "ok" | "warn" | "info" | "neutral"; label: string }> = {
  checked: { tone: "ok", label: "Checked" },
  read: { tone: "neutral", label: "Read" },
  needs_check: { tone: "warn", label: "Check" },
  assumed: { tone: "info", label: "Assumed" },
  tradie: { tone: "ok", label: "Yours" },
};

export function FactStatusPill({ status }: { status: FactStatus }) {
  return <StatusPill tone={STATUS[status].tone}>{STATUS[status].label}</StatusPill>;
}

/** The first page a fact came from, for "Show on plan". */
export function firstEvidence(evidence: readonly Evidence[] | undefined): { page: number; text?: number[] } | null {
  const e = evidence?.[0];
  return e ? { page: e.page, text: e.text } : null;
}

/** One fact: what it is, its value, how sure, where it came from, and a way to correct it. */
export function FactRow({
  label,
  fact,
  format,
  editKey,
  unit,
  setId,
  onSaved,
  onShow,
}: {
  label: string;
  fact: Fact<number> | Fact<string> | null;
  format?: (v: number | string) => string;
  /** "set:…" answer key to correct a number. */
  editKey?: string;
  unit?: string;
  setId: string;
  onSaved: () => void;
  onShow: (page: number, text?: number[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ev = firstEvidence(fact?.evidence);
  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid={`fact-${label}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ui-sm text-ui-muted">{label}</p>
          <p className="text-ui-base font-semibold text-ui-text">{fact ? (format ? format(fact.value) : String(fact.value)) : "Not on the plans"}</p>
          {fact?.note ? <p className="text-ui-sm text-ui-muted">{fact.note}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {fact ? <FactStatusPill status={fact.status} /> : null}
          {ev ? (
            <button type="button" className="text-ui-sm font-semibold text-ui-brand-text underline-offset-2 hover:underline" onClick={() => onShow(ev.page, ev.text)}>
              Show on plan
            </button>
          ) : null}
          {editKey ? (
            <button type="button" className="text-ui-sm font-semibold text-ui-brand-text underline-offset-2 hover:underline" onClick={() => setEditing((x) => !x)}>
              {editing ? "Cancel" : "Change"}
            </button>
          ) : null}
        </div>
      </div>
      {editing && editKey ? (
        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Number(value);
            if (!Number.isFinite(n) || n <= 0) return setErr("Enter a number.");
            const problem = await saveAnswers(setId, { [editKey]: n });
            if (problem) return setErr(problem);
            setEditing(false);
            setValue("");
            onSaved();
          }}
        >
          <input
            inputMode="decimal"
            className="min-h-12 w-32 rounded-ui-md border border-ui-line bg-ui-surface-2 px-3 text-ui-base text-ui-text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setErr(null);
            }}
            aria-label={`${label}${unit ? ` in ${unit}` : ""}`}
          />
          {unit ? <span className="text-ui-sm text-ui-muted">{unit}</span> : null}
          <Button size="sm" type="submit">Save</Button>
          {err ? <span className="text-ui-sm text-ui-bad">{err}</span> : null}
        </form>
      ) : null}
    </div>
  );
}

/** The input for a flag's question: confirm, a number, or a choice. */
export function QuestionInput({ question, onAnswer }: { question: Question; onAnswer: (v: string | number | boolean) => Promise<string | null> }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (v: string | number | boolean) => {
    setBusy(true);
    const problem = await onAnswer(v);
    setBusy(false);
    setErr(problem);
  };
  let body: ReactNode;
  if (question.kind === "confirm") {
    body = (
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={() => void send(true)}>Yes</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void send(false)}>No</Button>
      </div>
    );
  } else if (question.kind === "choice") {
    body = (
      <div className="flex flex-wrap gap-2">
        {question.options.map((o) => (
          <Button key={o} size="sm" variant="secondary" disabled={busy} onClick={() => void send(o)}>
            {o}
          </Button>
        ))}
      </div>
    );
  } else {
    body = (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0) return setErr("Enter a number.");
          void send(n);
        }}
      >
        <input inputMode="decimal" className="min-h-12 w-32 rounded-ui-md border border-ui-line bg-ui-surface-2 px-3 text-ui-base text-ui-text" value={value} onChange={(e) => setValue(e.target.value)} aria-label={question.prompt} />
        <span className="text-ui-sm text-ui-muted">{question.unit}</span>
        <Button size="sm" type="submit" loading={busy}>Save</Button>
      </form>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-ui-sm font-semibold text-ui-text">{question.prompt}</p>
      {body}
      {err ? <p className="text-ui-sm text-ui-bad">{err}</p> : null}
    </div>
  );
}
