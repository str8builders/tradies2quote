import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { isValidRequestSlug, requestLinkFor } from "@/lib/quote-requests/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QR code for the signed-in tradie's own request link. Only renders the
 * caller's slug so it can't be used to mint codes for other people's links.
 *
 *   ?format=svg (default)  crisp vector for sign writers and print
 *   ?format=png&size=1024  raster for social posts, email signatures, phones
 *   ?download=1            send as a file instead of showing inline
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
  const params = request.nextUrl.searchParams;
  const download = params.get("download") === "1";
  const format = params.get("format") === "png" ? "png" : "svg";
  const size = Math.min(2048, Math.max(256, Number(params.get("size")) || 512));
  const options = { errorCorrectionLevel: "M" as const, margin: 2, width: size, color: { dark: "#111111", light: "#ffffff" } };
  const filename = `tradies2quote-request-${slug}.${format}`;
  const headers: Record<string, string> = {
    "cache-control": "private, max-age=300",
    ...(download ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
  };
  if (format === "png") {
    const png = await QRCode.toBuffer(link, { ...options, type: "png" });
    return new NextResponse(new Uint8Array(png), { status: 200, headers: { ...headers, "content-type": "image/png" } });
  }
  const svg = await QRCode.toString(link, { ...options, type: "svg" });
  return new NextResponse(svg, { status: 200, headers: { ...headers, "content-type": "image/svg+xml; charset=utf-8" } });
}
