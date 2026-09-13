import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "../_components/AppHeader";

export const metadata: Metadata = { title: "Quote requests" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "Draft being prepared",
  generated: "Draft ready to review",
  generation_failed: "Needs you to generate",
  dismissed: "Dismissed",
};

export default async function RequestsPage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("quote_requests")
    .select(
      "id, quote_id, client_name, client_email, client_phone, site_address, description, status, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = requests ?? [];

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Quote requests" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <div className="t2q-section-label-pro mb-3">{"// from your request link"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Quote <span className="text-brand">requests.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300">
            Jobs clients have sent through your public link. Each one is a draft quote on your
            account — open it, check the numbers, and send.
          </p>
        </div>

        {rows.length === 0 ? (
          <section className="t2q-card-pro p-5 sm:p-6">
            <p className="text-sm text-ink-300">
              Nothing yet. Turn on your request link in{" "}
              <Link href="/app/settings" className="text-brand underline-offset-4 hover:underline">
                Settings
              </Link>{" "}
              and share it with clients.
            </p>
          </section>
        ) : (
          <ul className="space-y-4" data-testid="request-list">
            {rows.map((r) => (
              <li key={r.id} className="t2q-card-pro p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg uppercase tracking-tight">{r.client_name}</h2>
                    <p className="text-xs text-ink-400">
                      {[r.client_phone, r.client_email, r.site_address].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                  </div>
                  <span className="rounded-sm border border-ink-600 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-300">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink-200">{r.description}</p>
                {r.error_message ? (
                  <p className="mt-2 text-xs text-hivis">{r.error_message}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-ink-500">
                    {new Intl.DateTimeFormat("en-NZ", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Pacific/Auckland",
                    }).format(new Date(r.created_at))}
                  </span>
                  {r.quote_id ? (
                    <Link href={`/app/quotes/preview/${r.quote_id}`} className="t2q-btn-primary-pro">
                      Open draft quote
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
