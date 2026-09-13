"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuoteGenerationProgress } from "./QuoteGenerationProgress";

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function QuoteGenerator({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [pending, setPending] = useState<boolean>(true);
  const [elapsedS, setElapsedS] = useState<number>(0);
  const [complete, setComplete] = useState(false);
  const startedRef = useRef<boolean>(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The elapsed clock remains useful when motion is reduced.
  useEffect(() => {
    if (!pending || complete) return;
    const t = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending, complete]);

  async function generate() {
    setError("");
    setElapsedS(0);
    setComplete(false);
    setPending(true);
    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
        // Preserve the request bound for queued or substantial quotes.
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
      if (res.status === 409) {
        router.refresh();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setError(data.message || data.error || `Generation failed (${res.status}).`);
        setPending(false);
        return;
      }
      setComplete(true);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <section
      data-testid="quote-generator"
      className="t2q-card-pro flex min-h-[340px] flex-col items-center justify-center p-6 text-center sm:p-8"
    >
      {pending ? (
        <>
          <QuoteGenerationProgress complete={complete} />
          <h2 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
            {complete ? "Your quote is ready." : "Writing your quote…"}
          </h2>
          <p
            aria-live="polite"
            className="mt-3 max-w-sm text-sm text-ink-300 sm:text-base"
          >
            {complete ? "Opening your review." : elapsedS >= 60
              ? "Still working. Your job details are saved."
              : "Turning your job details into materials, labour and a total for you to check."}
          </p>
          <p className="mt-4 text-xs tabular-nums text-ink-400">
            {`${fmtElapsed(elapsedS)} elapsed`}
          </p>
        </>
      ) : (
        <>
          <p
            data-testid="quote-generator-error"
            className="font-display text-xl uppercase tracking-tight text-red-400"
          >
            Generation failed
          </p>
          <p className="mt-3 max-w-md text-sm text-ink-300">{error}</p>
          <p className="mt-3 max-w-md text-sm text-ink-400">
            Your draft is saved. Try again, or return to it later from Quotes.
          </p>
          {/* A failed generation has no line items to edit yet. */}
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <button
              type="button"
              data-testid="quote-generator-retry"
              onClick={() => {
                startedRef.current = true;
                void generate();
              }}
              className="t2q-btn-primary-pro inline-flex h-11 items-center justify-center px-5"
            >
              Try again
            </button>
            <Link
              href="/app"
              data-testid="quote-generator-dashboard"
              className="inline-flex h-11 items-center justify-center px-5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-brand"
            >
              Back to dashboard
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
