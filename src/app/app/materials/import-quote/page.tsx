import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { NZ_DEFAULTS } from "@/lib/quote-defaults";
import { AppHeader } from "../../_components/AppHeader";
import { QuoteImportClient } from "./_components/QuoteImportClient";

export const metadata: Metadata = {
  title: "Scan supplier quote",
};

export default async function ImportQuotePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("currency, tax_rate")
    .eq("id", user.id)
    .maybeSingle();
  const currency = profile?.currency ?? NZ_DEFAULTS.currency;
  // Stored as a percentage (15 = 15 %); the client works in fractions.
  const taxRate = Number(profile?.tax_rate ?? NZ_DEFAULTS.tax_rate) / 100;

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Materials" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/app/materials"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-brand"
        >
          <ArrowLeft size={12} weight="bold" />
          Back to materials
        </Link>

        <div className="mt-4 mb-2">
          <div className="t2q-section-label-pro mb-3">{"// supplier quote"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Scan a supplier <span className="text-brand">quote.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Snap a photo of a quote or invoice from ITM, PlaceMakers, Mitre 10
            or similar, or pick photos already on your phone — every page of a
            long quote in one go. We&apos;ll read the line items so you can check
            them, then turn them straight into a quote — same numbers — or add the
            prices to your library.
          </p>
          <p className="mt-2 text-xs text-ink-400">
            The scan reads the prices — you confirm every line before anything
            is saved. Saved prices are marked as estimates from a scanned quote,
            so confirm them with the supplier.
          </p>
        </div>

        <QuoteImportClient currency={currency} taxRate={taxRate} />
      </main>
    </div>
  );
}
