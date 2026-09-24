import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NZ_DEFAULTS } from "@/lib/quote-defaults";
import { ImportClient } from "./_components/ImportClient";

export const metadata: Metadata = {
  title: "Import materials",
};

export default async function ImportMaterialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tax_rate")
    .eq("id", user.id)
    .maybeSingle();
  // Stored as a percentage (15 = 15 %); the client works in fractions.
  const taxRate = Number(profile?.tax_rate ?? NZ_DEFAULTS.tax_rate) / 100;

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-ink-700/60 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/app/materials"
            className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white"
          >
            ← Library
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
            Import CSV
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <div className="t2q-section-label-pro mb-3">{"// bulk import"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Import <span className="text-brand">CSV.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Drop in a CSV from your spreadsheet. We&apos;ll match existing items by name and update prices, or add new ones.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="materials-import-choice">
            <div className="rounded-lg border border-brand/50 bg-brand/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">{"// this page"}</div>
              <p className="mt-1 text-sm font-semibold text-white">Upload a CSV</p>
              <p className="mt-1 text-xs text-ink-300">From your spreadsheet or a supplier export. Pick the file from your phone or computer below.</p>
            </div>
            <Link href="/app/materials/import-quote" className="rounded-lg border border-ink-700 bg-ink-900/70 p-4 transition hover:border-brand" data-testid="materials-import-photos-link">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">{"// or from photos"}</div>
              <p className="mt-1 text-sm font-semibold text-white">Scan photos instead</p>
              <p className="mt-1 text-xs text-ink-300">Photograph a supplier quote or invoice, or pick photos already on your phone — up to six at once. We read the lines and prices.</p>
            </Link>
          </div>
        </div>

        <ImportClient taxRate={taxRate} />
      </main>
    </div>
  );
}
