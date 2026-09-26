import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasAiConsent } from "@/lib/ai-consent";
import { isNativeShellRequest } from "@/lib/native-shell";
import { NZ_DEFAULTS, resolveTaxLabel, resolveTaxRate } from "@/lib/quote-defaults";
import { isNewLookOn } from "@/lib/ui/newLook";
import { PriceImportScreen } from "../_newlook/PriceImportScreen";
import { ImportClient } from "./_components/ImportClient";

export const metadata: Metadata = {
  title: "Import a price list",
};

export default async function ImportMaterialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, nativeShell, newLook] = await Promise.all([
    supabase
      .from("profiles")
      .select("tax_rate, tax_label, country, currency")
      .eq("id", user.id)
      .maybeSingle(),
    isNativeShellRequest(),
    isNewLookOn(),
  ]);
  // The tradie's own tax label and rate (a UK profile is VAT 20 %, never
  // NZ's "GST" 15 %). Stored as a percentage; the client works in fractions.
  const taxRate = resolveTaxRate(profile?.tax_rate, profile?.country, profile?.currency) / 100;
  const taxLabel = resolveTaxLabel(profile?.tax_label, profile?.country, profile?.currency);
  const currency = profile?.currency ?? NZ_DEFAULTS.currency;
  // App Store 5.1.2(i): a PDF or photo is read by the AI, so the iPhone app
  // asks for consent before the first one (the route enforces it anyway).
  const needsAiConsent = nativeShell && !(await hasAiConsent(supabase, user.id));

  if (newLook) {
    return (
      <PriceImportScreen taxRate={taxRate} taxLabel={taxLabel} currency={currency} needsAiConsent={needsAiConsent} />
    );
  }

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
            Import price list
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <div className="t2q-section-label-pro mb-3">{"// bulk import"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Import a <span className="text-brand">price list.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            A CSV or Excel file from your supplier&apos;s trade account, a PDF, or photos of a printed list.
            We&apos;ll match items you already have by code or name and update their prices, or add new ones.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="materials-import-choice">
            <div className="rounded-lg border border-brand/50 bg-brand/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">{"// this page"}</div>
              <p className="mt-1 text-sm font-semibold text-white">Import a price list</p>
              <p className="mt-1 text-xs text-ink-300">CSV, Excel (.xlsx), PDF or photos. You check every row before it&apos;s saved.</p>
            </div>
            <Link href="/app/materials/import-quote" className="rounded-lg border border-ink-700 bg-ink-900/70 p-4 transition hover:border-brand" data-testid="materials-import-photos-link">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">{"// or a quote"}</div>
              <p className="mt-1 text-sm font-semibold text-white">Scan a supplier quote instead</p>
              <p className="mt-1 text-xs text-ink-300">Photograph a quote or invoice, or pick a PDF — we read the lines, check the totals, and can turn it into a quote.</p>
            </Link>
          </div>
        </div>

        <ImportClient taxRate={taxRate} taxLabel={taxLabel} needsAiConsent={needsAiConsent} />
      </main>
    </div>
  );
}
