import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { isValidRequestSlug, requestLinkFor } from "@/lib/quote-requests/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SVG QR code for the signed-in tradie's own request link. Only renders the
 * caller's slug so it can't be used to mint codes for other people's links.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("request_slug")
    .eq("id", user.id)
    .maybeSingle();
  const slug = profile?.request_slug ?? null;
  if (!slug || !isValidRequestSlug(slug)) {
    return NextResponse.json({ error: "Request link is off." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const link = requestLinkFor(appUrl, slug);
  const svg = await QRCode.toString(link, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#111111", light: "#ffffff" },
  });
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=300",
      ...(download ? { "content-disposition": `attachment; filename="tradies2quote-request-${slug}.svg"` } : {}),
    },
  });
}
