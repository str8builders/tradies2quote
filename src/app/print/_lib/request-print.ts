import "server-only";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { QR_CODE_PATH } from "@/app/app/_v2/lib/app-nav";
import { isNativeShellRequest } from "@/lib/native-shell";
import { isValidRequestSlug, requestLinkFor } from "@/lib/quote-requests/slug";
import { createClient } from "@/lib/supabase/server";

/** What a request-QR print sheet (poster, stickers) shows. */
export interface RequestPrint {
  business: string;
  phone: string | null;
  /** The tradie's own uploaded logo (https only), or null. */
  logo: string | null;
  link: string;
  /** The link without https://, for print. */
  shortLink: string;
  /** The QR code as SVG markup: dark on white, high error correction so a logo can sit in the middle. */
  svg: string;
  /** In the iPhone app, where a web page can't print (WKWebView ignores window.print). */
  inApp: boolean;
}

/**
 * The print sheets live outside the /app shell (so only the sheet reaches the
 * printer) and do their own sign-in check, because the proxy only gates /app.
 * No request link yet: back to Your QR code, which turns it on.
 */
export async function loadRequestPrint(returnTo: string): Promise<RequestPrint> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, phone, request_slug, logo_url")
    .eq("id", user.id)
    .maybeSingle();
  const slug = profile?.request_slug ?? null;
  if (!slug || !isValidRequestSlug(slug)) redirect(QR_CODE_PATH);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tradies2quote.com";
  const link = requestLinkFor(appUrl, slug);
  const svg = await QRCode.toString(link, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    width: 640,
    color: { dark: "#0A0A0A", light: "#FFFFFF" },
  });
  return {
    business: profile?.business_name?.trim() || "Request a quote",
    phone: profile?.phone?.trim() || null,
    logo: profile?.logo_url && /^https:\/\//i.test(profile.logo_url) ? profile.logo_url : null,
    link,
    shortLink: link.replace(/^https?:\/\//, ""),
    svg,
    inApp: await isNativeShellRequest(),
  };
}
