import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { isValidRequestSlug } from "@/lib/quote-requests/slug";
import { RequestForm } from "./_components/RequestForm";

export const dynamic = "force-dynamic";

type Params = { slug: string };

async function loadTradie(slug: string) {
  if (!isValidRequestSlug(slug)) return null;
  const { data } = await adminClient()
    .from("profiles")
    .select("id, business_name, logo_url")
    .eq("request_slug", slug)
    .maybeSingle();
  return data ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const tradie = await loadTradie(slug);
  const name = tradie?.business_name?.trim() || "your tradie";
  return {
    title: `Request a quote from ${name}`,
    description: `Describe the job and ${name} will come back with a quote.`,
    robots: { index: false, follow: false },
  };
}

export default async function RequestQuotePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const tradie = await loadTradie(slug);
  if (!tradie) notFound();

  const business = tradie.business_name?.trim() || "Your tradie";
  const logo = tradie.logo_url && /^https:\/\//i.test(tradie.logo_url) ? tradie.logo_url : null;

  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 flex items-center gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              className="h-14 w-14 rounded-sm border border-ink-700 bg-ink-800 object-contain p-1"
            />
          ) : null}
          <div>
            <div className="t2q-section-label-pro mb-1">{"// request a quote"}</div>
            <h1 className="font-display text-2xl uppercase tracking-tight sm:text-3xl">{business}</h1>
          </div>
        </header>

        <p className="mb-6 text-sm text-ink-300 sm:text-base">
          Tell {business} what you need done, in your own words. They&rsquo;ll review it and come
          back to you with a quote. No account needed.
        </p>

        <RequestForm slug={slug} business={business} />

        <p className="mt-8 text-xs text-ink-500">
          Powered by Tradies2Quote. Your details go only to {business}.
        </p>
      </main>
    </div>
  );
}
