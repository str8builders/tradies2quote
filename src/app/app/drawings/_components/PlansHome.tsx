"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePdf, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Screen } from "@/components/ui/screen";
import { StatusPill } from "@/components/ui/status-pill";
import { TopBar } from "@/components/ui/top-bar";
import { HOME_PATH } from "@/app/app/_v2/lib/app-nav";
import { AiConsentModal } from "@/app/app/quotes/new/_components/AiConsentModal";
import { createClient } from "@/lib/supabase/client";
import { planFileProblem, setName } from "@/lib/planset/combine";
import type { PlanSetListItem, PlanSetStatus } from "@/lib/planset/api-types";

const MAX_BYTES = 50 * 1024 * 1024;

export const STATUS_LABEL: Record<PlanSetStatus, { tone: "ok" | "warn" | "bad" | "info" | "neutral"; label: string }> = {
  uploading: { tone: "neutral", label: "Uploading" },
  queued: { tone: "info", label: "Waiting" },
  reading: { tone: "info", label: "Reading" },
  ready: { tone: "ok", label: "Ready" },
  failed: { tone: "bad", label: "Didn't read" },
};

/**
 * Upload a whole plan set (the PDF the designer sent) and see the ones read
 * so far. The PDF goes straight to private storage; the server reads it in
 * the background, so the tradie can leave and come back.
 */
export function PlansHome({
  sets,
  needsConsent,
  back = { href: HOME_PATH, label: "Home" },
}: {
  sets: PlanSetListItem[];
  needsConsent: boolean;
  /** Where the top bar's Back goes: Home, or New quote when opened from there. */
  back?: { href: string; label: string };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState(false);
  const [pending, setPending] = useState<File[] | null>(null);
  // Asked once in the iPhone app; after "Allow" the upload carries on.
  const consented = useRef(!needsConsent);

  async function upload(files: File[]) {
    setError(null);
    if (!files.length) return;
    const problems = files.map(planFileProblem).filter((p): p is string => !!p);
    if (problems.length) return setError(problems.join(" "));
    if (!consented.current) {
      setPending(files);
      setAskConsent(true);
      return;
    }
    try {
      setBusy(files.length === 1 ? "Getting it ready…" : `Putting ${files.length} files together…`);
      // Photos and several files become one PDF here; a single PDF goes up as it is.
      const { planUploadFile } = await import("@/lib/planset/combine-client");
      const file = await planUploadFile(files, (step) => setBusy(step));
      if (file.size > MAX_BYTES) throw new Error("Together that's bigger than 50 MB. Upload the drawings in two lots.");
      setBusy("Starting the upload…");
      const res = await fetch("/api/plansets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ original_filename: setName(files.map((f) => f.name)), byte_size: file.size }) });
      const body = (await res.json().catch(() => ({}))) as { id?: string; upload?: { path: string; token: string }; error?: string; message?: string };
      if (res.status === 403 && body.error === "ai_consent_required") {
        setPending(files);
        setAskConsent(true);
        setBusy(null);
        return;
      }
      if (!res.ok || !body.id || !body.upload) throw new Error(body.message || body.error || "Couldn't start the upload.");
      setBusy(files.length === 1 ? `Uploading ${files[0].name}…` : `Uploading ${files.length} files…`);
      const up = await createClient().storage.from("plan-uploads").uploadToSignedUrl(body.upload.path, body.upload.token, file, { contentType: "application/pdf" });
      if (up.error) throw new Error("The upload didn't finish. Check your connection and try again.");
      setBusy("Starting to read…");
      const start = await fetch(`/api/plansets/${body.id}/start`, { method: "POST" });
      if (!start.ok) {
        const b = (await start.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error || "Couldn't start reading the plans.");
      }
      router.push(`/app/drawings/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(null);
    }
  }

  return (
    <Screen data-testid="plans-home">
      <TopBar title="Read drawings" back={back} safeArea={false} />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
        <Card padding="lg" className="space-y-4">
          <div className="flex items-start gap-3">
            <FilePdf weight="duotone" className="mt-0.5 shrink-0 text-[1.75rem] text-ui-brand-text" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="text-ui-lg font-semibold text-ui-text">Upload the plans</h2>
              <p className="text-ui-sm text-ui-muted">
                Any plan files: the consented PDF set, the engineer&apos;s PDF too, scans, or photos of paper plans (JPG, PNG, HEIC).
                Pick several at once and they&apos;re read as one set. It reads every sheet, checks the dimensions two ways, and lists
                what goes where and the materials. Up to 50 MB in all.
              </p>
            </div>
          </div>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf,image/*,.heic,.heif,.dwg,.dxf"
            multiple
            className="sr-only"
            data-testid="plans-file"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              void upload(picked);
            }}
          />
          <Button fullWidth loading={!!busy} disabled={!!busy} onClick={() => input.current?.click()}>
            <UploadSimple weight="bold" aria-hidden="true" /> {busy ?? "Choose the plan files"}
          </Button>
          {error ? <Callout tone="bad">{error}</Callout> : null}
        </Card>

        <section className="space-y-2" aria-labelledby="plans-list">
          <h2 id="plans-list" className="text-ui-sm font-semibold text-ui-muted">
            Plans you&apos;ve uploaded
          </h2>
          {sets.length ? (
            <Card padding="none" as="section">
              <ul className="divide-y divide-ui-line">
                {sets.map((s) => (
                  <li key={s.id}>
                    <ListRow
                      title={s.original_filename}
                      subtitle={s.status === "reading" && s.step ? s.step : s.status === "failed" ? s.error ?? "Didn't read" : `${s.page_count ?? "?"} sheets · ${new Date(s.created_at).toLocaleDateString("en-NZ")}`}
                      trailing={<StatusPill tone={STATUS_LABEL[s.status].tone}>{STATUS_LABEL[s.status].label}</StatusPill>}
                      href={`/app/drawings/${s.id}`}
                      chevron
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState icon={<FilePdf weight="duotone" />} title="No plans yet" as="h3">
              Upload a consented plan set to start.
            </EmptyState>
          )}
        </section>
      </div>
      <AiConsentModal
        look="new"
        open={askConsent}
        onGranted={() => {
          consented.current = true;
          setAskConsent(false);
          const f = pending;
          setPending(null);
          if (f) void upload(f);
        }}
      />
    </Screen>
  );
}
