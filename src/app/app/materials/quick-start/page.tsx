import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Screen } from "@/components/ui/screen";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { QuickStartForm } from "./_components/QuickStartForm";
import { QuickStartBody } from "./_newlook/QuickStartBody";

export const metadata: Metadata = {
  title: "Quick start your library",
};

export const dynamic = "force-dynamic";

export default async function MaterialsQuickStartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read the tradie's currency from the profile so we render the
  // right symbol on each row. Fall back to NZD when no profile row
  // exists yet (fresh signup before they've visited Settings).
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", user.id)
    .maybeSingle();
  const currency = profile?.currency ?? "NZD";

  // Redesign: the new look's body under <AppHeader>'s top bar ("Quick
  // start", back to Prices), so no second Back link. Off: unchanged below.
  if (await isNewLookOn()) {
    return (
      <Screen data-testid="quick-start-screen">
        <AppHeader />
        <QuickStartBody currency={currency} />
      </Screen>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/app"
          data-testid="quick-start-back"
          className="inline-flex items-center gap-1 text-sm font-mono uppercase tracking-[0.2em] text-ink-300 hover:text-white"
        >
          <ArrowLeft size={14} weight="bold" />
          Back
        </Link>

        <div className="mt-4 mb-6">
          <div className="t2q-section-label-pro mb-2.5">
            {"// boost quote accuracy"}
          </div>
          <h1 className="font-display text-[2rem] leading-[1.05] uppercase tracking-tight sm:text-[2.5rem]">
            Add the materials you use every week.
          </h1>
          <p className="mt-3 max-w-prose text-sm text-ink-300 sm:text-base">
            Every price you set here means one less line T2Q has to
            estimate on your future quotes. Skip the rows you don&rsquo;t
            buy — only filled-in prices get saved. You can always edit,
            add or remove materials later from the Materials page.
          </p>
        </div>

        <section className="t2q-card-pro p-5 sm:p-6">
          <QuickStartForm currency={currency} />
        </section>
      </main>
    </div>
  );
}
