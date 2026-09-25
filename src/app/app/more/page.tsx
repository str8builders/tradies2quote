import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isOwnerEmail } from "@/lib/owner";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { getNewLookState } from "@/lib/ui/newLook";
import { OUTDOOR_COOKIE, isOutdoorCookieValue } from "@/lib/ui/outdoor";
import { loadTopBarData } from "../_v2/lib/top-bar";
import { MoreView } from "./_components/MoreView";

export const metadata: Metadata = {
  title: "More",
};

export const dynamic = "force-dynamic";

/**
 * /app/more — new look only (redesign phase 2). With the new look off the
 * old account menu is still the way to these places, so this hands over to
 * the dashboard and the old look is unchanged.
 */
export default async function MorePage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  const look = await getNewLookState();
  if (!look.on) redirect("/app");

  const [cookieStore, bar] = await Promise.all([cookies(), loadTopBarData()]);
  const outdoor = isOutdoorCookieValue(cookieStore.get(OUTDOOR_COOKIE)?.value);
  return (
    <MoreView
      bar={bar}
      isOwner={isOwnerEmail(user.email)}
      outdoor={outdoor}
      canChooseLook={look.canChoose}
    />
  );
}
