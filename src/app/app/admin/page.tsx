import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { isOwnerEmail } from "@/lib/owner";
import { buildAdminOverview } from "@/lib/admin/overview";
import { AppHeader } from "../_components/AppHeader";
import { AdminDashboard } from "./_components/AdminDashboard";

export const metadata: Metadata = {
  title: "Ops",
};

export const dynamic = "force-dynamic";

/**
 * `/app/admin` — owner-only Ops cockpit.
 *
 * Aggregates Stripe revenue, our own DB growth metrics (including the
 * "trials running out" feed), and per-connector health/budget into one
 * live page. Gated with the same redirect + `notFound()` pattern as
 * /app/agents so the route isn't advertised to non-owners.
 *
 * The initial overview is built server-side for a fast first paint; the
 * client component then re-polls /api/admin/overview every 30s.
 */
export default async function AdminPage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  if (!isOwnerEmail(user.email)) notFound();

  const initial = await buildAdminOverview();

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Ops" />
      <main data-legacy-body="" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <AdminDashboard initial={initial} />
      </main>
    </div>
  );
}
