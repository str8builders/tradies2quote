import { getCachedAuthUser } from "@/lib/supabase/auth";
import { getCachedAvatarUrl } from "@/lib/supabase/profile";
import { isOwnerEmail } from "@/lib/owner";
import { isNewLookOn } from "@/lib/ui/newLook";
import { LegacyTopBar } from "../_v2/shell/LegacyTopBar";
import { AppHeaderClient } from "./AppHeaderClient";

/**
 * Server wrapper for the shared `/app/*` header.
 *
 * Wave 13 — owner-only tab gating. Fetches the current user server-
 * side and passes `isOwner` to the client tabs component so the
 * Agents tab is hidden from non-owner tradies without leaking its
 * existence to the client bundle.
 *
 * Wave 15 — also plumbs `userEmail` + `avatarUrl` through so the
 * client header can render the avatar trigger that opens the new
 * account hub. The profile read tolerates the `avatar_url` column
 * not existing yet (Wave 15 migration is pending): wrapped in
 * try/catch, falls back to `null` for the initials placeholder.
 *
 * Every existing call site (e.g. `<AppHeader context="Quotes" />`)
 * keeps working — this server component just renders the client
 * child with the resolved flags.
 *
 * Redesign phase 2 — in the new look (isNewLookOn()) the page is not
 * redesigned yet, and the shell already has the tab bar / side rail, so
 * this renders only a plain new-style top bar: title and a way back.
 */
interface Props {
  /** Optional page label shown next to the logo on desktop only. */
  context?: string;
}

export async function AppHeader({ context }: Props) {
  if (await isNewLookOn()) return <LegacyTopBar context={context} />;
  // Wave 18.1/42 — perf — auth and avatar reads are cached per render,
  // so this header shares the same user/profile work with
  // `<MobileAppMenu>` and the page instead of issuing duplicate
  // Supabase round trips.
  const { user } = await getCachedAuthUser();
  const isOwner = isOwnerEmail(user?.email);
  const avatarUrl = user?.id ? await getCachedAvatarUrl(user.id) : null;

  return (
    <AppHeaderClient
      context={context}
      isOwner={isOwner}
      userEmail={user?.email ?? null}
      avatarUrl={avatarUrl}
    />
  );
}
