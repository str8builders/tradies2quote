import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Who is looking at a quote link. The client has no account, so a signed-in
 * visitor is almost always the tradie (or their team) checking the link —
 * the job page's "Open it" button — which must not count as the client
 * opening the quote.
 */

/** The signed-in visitor's user id; null for a client with no account, or on any failure. */
export async function signedInUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * True when `visitorId` owns the quote behind `token`, or is on the same team
 * as its owner. Any lookup failure counts as "not the team", so a client's
 * visit is never lost to an error.
 */
export async function isQuoteTeamVisitor(
  admin: SupabaseClient,
  token: string,
  visitorId: string,
): Promise<boolean> {
  try {
    const { data: quote } = await admin
      .from("quotes")
      .select("user_id")
      .eq("public_token", token)
      .maybeSingle();
    const ownerId = (quote as { user_id?: string } | null)?.user_id;
    if (!ownerId) return false;
    if (ownerId === visitorId) return true;
    // team_members.user_id is unique: each person is on at most one team.
    const { data: members } = await admin
      .from("team_members")
      .select("user_id, team_id")
      .in("user_id", [visitorId, ownerId]);
    const teamOf = new Map(
      ((members ?? []) as Array<{ user_id: string; team_id: string }>).map((m) => [m.user_id, m.team_id]),
    );
    const visitorTeam = teamOf.get(visitorId);
    return !!visitorTeam && visitorTeam === teamOf.get(ownerId);
  } catch {
    return false;
  }
}
