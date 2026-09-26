import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { isNativeShellRequest } from "@/lib/native-shell";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { AppHeader } from "../_components/AppHeader";
import { QrCodeView } from "./_components/QrCodeView";

export const metadata: Metadata = { title: "Your QR code" };
export const dynamic = "force-dynamic";

/**
 * /app/qr-code (new look): the client request QR code, big enough to scan
 * off the phone, the ways to print it (van sticker, poster) and how to use
 * it. Reached from Home's quick actions and the menu behind your photo. The
 * link itself is managed in Rates and quotes (new link, turn off); the old
 * look keeps its settings card.
 */
export default async function QrCodePage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  if (!(await isNewLookOn())) redirect("/app/settings#request-link");
  const supabase = await createClient();
  const [{ data: profile }, inApp] = await Promise.all([
    supabase.from("profiles").select("business_name, request_slug, logo_url").eq("id", user.id).maybeSingle(),
    isNativeShellRequest(),
  ]);
  return (
    <Screen data-testid="qr-code-screen">
      <AppHeader context="Your QR code" />
      <QrCodeView
        initialSlug={profile?.request_slug ?? null}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "https://tradies2quote.com"}
        hasBusinessName={Boolean(profile?.business_name?.trim())}
        hasLogo={Boolean(profile?.logo_url && /^https:\/\//i.test(profile.logo_url))}
        inApp={inApp}
      />
    </Screen>
  );
}
