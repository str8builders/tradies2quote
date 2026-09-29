"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/ui/top-bar";
import type { PlanSetView } from "@/lib/planset/api-types";
import { SummaryTab } from "./SummaryTab";
import { QuestionsTab } from "./QuestionsTab";
import { MaterialsTab } from "./MaterialsTab";
import { SheetViewer } from "./SheetViewer";
import { QuoteBreakdownBar } from "./QuoteBreakdownBar";

type Tab = "summary" | "plan" | "questions" | "materials";

/**
 * One plan set: while it's being read, what it's doing (it carries on if
 * the tradie leaves); when read, the summary, the plan with what goes
 * where drawn on it, the questions, and the materials — with the Quote
 * breakdown button at the thumb on every tab.
 */
export function PlanSetScreen({ id, name }: { id: string; name: string }) {
  const [view, setView] = useState<PlanSetView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [focus, setFocus] = useState<{ page: number; text?: number[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plansets/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Couldn't load these plans.");
      setView((await res.json()) as PlanSetView);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load these plans.");
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plansets/${id}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PlanSetView>) : Promise.reject(new Error("Couldn't load these plans."))))
      .then((v) => !cancelled && setView(v))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);
  const working = view && (view.status === "uploading" || view.status === "queued" || view.status === "reading");
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [working, load]);

  async function retry() {
    await fetch(`/api/plansets/${id}/start`, { method: "POST" });
    await load();
  }

  const openOnPlan = (page: number, text?: number[]) => {
    setFocus({ page, text });
    setTab("plan");
  };

  const openQuestions = view?.model ? view.model.flags.filter((f) => !f.resolved && f.level !== "info").length : 0;

  return (
    <Screen data-testid="planset-screen">
      <TopBar title="Drawings" subtitle={name} back={{ href: "/app/drawings", label: "Drawings" }} safeArea={false} />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 pt-5 pb-28">
        {error ? <Callout tone="bad">{error}</Callout> : null}
        {!view ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : working ? (
          <Card padding="lg" className="space-y-3" data-testid="planset-progress">
            <h2 className="text-ui-lg font-semibold text-ui-text">Reading your plans</h2>
            <p className="text-ui-base text-ui-text">{view.step ?? "Waiting to start"}</p>
            {view.progress?.total ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-ui-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={view.progress.total} aria-valuenow={view.progress.done ?? 0}>
                <div className="h-full bg-ui-brand transition-[width]" style={{ width: `${Math.round(((view.progress.done ?? 0) / view.progress.total) * 100)}%` }} />
              </div>
            ) : null}
            <p className="text-ui-sm text-ui-muted">A big set takes a few minutes. You can leave this page — it keeps reading.</p>
          </Card>
        ) : view.status === "failed" ? (
          <Callout tone="bad" title="These plans didn't read" action={<Button variant="secondary" onClick={() => void retry()}>Try again</Button>}>
            {view.error ?? "Something went wrong."}
          </Callout>
        ) : view.model ? (
          <>
            <SegmentedControl<Tab>
              label="Show"
              labelHidden
              value={tab}
              onChange={setTab}
              options={[
                { value: "summary", label: "Summary" },
                { value: "plan", label: "Plan" },
                { value: "questions", label: openQuestions ? `Questions (${openQuestions})` : "Questions" },
                { value: "materials", label: "Materials" },
              ]}
            />
            {tab === "summary" ? <SummaryTab view={view} onShow={openOnPlan} onSaved={load} /> : null}
            {tab === "plan" ? <SheetViewer setId={id} sheets={view.sheets} model={view.model} focus={focus} /> : null}
            {tab === "questions" ? <QuestionsTab setId={id} view={view} onSaved={load} onShow={openOnPlan} /> : null}
            {tab === "materials" ? <MaterialsTab setId={id} view={view} onSaved={load} /> : null}
          </>
        ) : null}
      </div>
      {view?.model && !working && view.status !== "failed" ? (
        <QuoteBreakdownBar
          setId={id}
          view={view}
          onShowQuestions={tab === "materials" ? undefined : () => setTab("materials")}
          showRemake={tab === "materials"}
        />
      ) : null}
    </Screen>
  );
}
