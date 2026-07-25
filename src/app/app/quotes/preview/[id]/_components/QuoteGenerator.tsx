"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";

/**
 * Elapsed-time-aware status copy. Generation has no real progress signal,
 * so honesty = tell the tradie what stage we're LIKELY in for the time
 * that has actually passed. Simple text quotes land in ~15–40s; the
 * measurement/takeoff path (decks, framing with dimensions) runs the
 * full calculators and can take 1–2 minutes — the old static
 * "usually 5–15 seconds" read as a hang the moment a real job ran long.
 */
const STAGES: ReadonlyArray<{ fromS: number; text: string }> = [
  { fromS: 0, text: "Reading your description…" },
  { fromS: 8, text: "Itemising materials, labour and GST…" },
  { fromS: 25, text: "Calculating quantities from your measurements…" },
  { fromS: 55, text: "Pricing lines from your materials library…" },
  {
    fromS: 90,
    text: "Still working — big takeoffs get double-checked, this can run a couple of minutes.",
  },
];

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
  const startedRef = useRef<boolean>(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1 Hz elapsed clock — drives the stage copy and the visible timer so
  // the wait always shows movement even while the tape needle holds.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  async function generate() {
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
        // Generation's server budget is 140s (TIMEOUTS.generation) — 170s
        // only catches a stalled connection; the error UI offers retry.
        signal: AbortSignal.timeout(170_000),
      });
      if (res.status === 409) {
        router.refresh();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `Generation failed (${res.status}).`);
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <section
      data-testid="quote-generator"
      className="t2q-card-pro flex min-h-[420px] flex-col items-center justify-center p-8 text-center"
    >
      {pending ? (
        <>
          {/* Live measuring-tape gauge — the SAME loader as the splash,
              scan and import screens. estimateMs is calibrated to the SLOW
              (takeoff) path so the needle keeps visibly creeping for the
              whole realistic wait instead of racing to 92% in 14s and then
              freezing for a minute (the old behaviour read as a hang). */}
          <TapeMeasureProgress
            label="// generating quote"
            estimateMs={75000}
          />
          <h2 className="mt-8 font-display text-2xl uppercase tracking-tight sm:text-3xl">
            Generating your <span className="text-brand">quote</span>…
          </h2>
          <p
            aria-live="polite"
            className="mt-3 max-w-sm text-sm text-ink-300 sm:text-base"
          >
            {STAGES.filter((st) => elapsedS >= st.fromS).at(-1)!.text}
          </p>
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
            {`// ${fmtElapsed(elapsedS)} elapsed · simple jobs ~30s · measured jobs up to ~2 min`}
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
          <p className="mt-3 max-w-md font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            {"// your draft was kept. you can retry, edit the lines manually, or come back later."}
          </p>
          {/* Wave 11 — three clear exits instead of one. The draft row
              is already saved server-side at this point (createDraftQuote
              ran before redirecting here), so "Edit manually" jumps
              straight into the editor with whatever skeleton state
              exists, and "Back to dashboard" is always safe. */}
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
            <button
              type="button"
              data-testid="quote-generator-manual"
              onClick={() => router.refresh()}
              className="t2q-btn-ghost-pro inline-flex h-11 items-center justify-center px-5"
            >
              Edit manually
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

