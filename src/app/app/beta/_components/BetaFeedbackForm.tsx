"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { submitBetaFeedback } from "../actions";

export const FIELDS = [
  {
    key: "whatWorked" as const,
    label: "What worked?",
    placeholder: "What felt fast, clear, or useful…",
  },
  {
    key: "whatConfusing" as const,
    label: "What was confusing?",
    placeholder: "Anything that tripped you up or felt unclear…",
  },
  {
    key: "wrongNumber" as const,
    label: "What quote number looked wrong?",
    placeholder: "A total, GST, quantity, or price that looked off…",
  },
  {
    key: "wouldPay" as const,
    label: "What feature would make T2Q a must-have?",
    placeholder: "The one thing that would make this a no-brainer…",
  },
];

type FormState = Record<(typeof FIELDS)[number]["key"], string>;

const EMPTY: FormState = {
  whatWorked: "",
  whatConfusing: "",
  wrongNumber: "",
  wouldPay: "",
};

export type FeedbackKey = keyof FormState;

/** The feedback form's state and its one action, shared by both looks. */
export function useBetaFeedback() {
  const [values, setValues] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const res = await submitBetaFeedback(values);
    if (res.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(res.error ?? "Something went wrong.");
    }
  }

  const setField = (key: FeedbackKey, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const reset = () => {
    setValues(EMPTY);
    setStatus("idle");
  };

  return { values, status, error, submit, setField, reset };
}

export type BetaFeedbackState = ReturnType<typeof useBetaFeedback>;

export function BetaFeedbackForm() {
  const { values, status, error, submit, setField, reset } = useBetaFeedback();

  if (status === "sent") {
    return (
      <section className="t2q-card-pro p-5 sm:p-7" data-testid="beta-feedback-sent">
        <p className="flex items-center gap-2 text-sm text-ink-100">
          <CheckCircle size={20} weight="fill" className="text-brand" />
          Thanks — got it. Every note goes straight to Challis.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400 hover:text-brand"
        >
          Send another
        </button>
      </section>
    );
  }

  return (
    <form
      data-testid="beta-feedback-form"
      onSubmit={submit}
      className="t2q-card-pro p-5 sm:p-7"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
        {"// send feedback"}
      </p>
      <p className="mt-2 text-sm text-ink-300">
        Tell us what to fix or what&apos;s working — fill in any box, skip
        the rest. It goes straight to the builder who made this.
      </p>

      <div className="mt-5 space-y-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-sm font-medium text-ink-100">{f.label}</span>
            <textarea
              name={f.key}
              value={values[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              rows={2}
              placeholder={f.placeholder}
              className="mt-1.5 w-full resize-y rounded-xl border border-ink-700 bg-ink-900/50 px-3 py-2.5 text-sm text-white placeholder:text-ink-500 focus:border-brand focus:outline-none"
            />
          </label>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="t2q-btn-primary-pro mt-5 inline-flex items-center gap-2 disabled:opacity-60"
      >
        <PaperPlaneTilt size={16} weight="fill" />
        {status === "sending" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
