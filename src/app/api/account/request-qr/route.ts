import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { isValidRequestSlug, requestLinkFor } from "@/lib/quote-requests/slug";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QR code for the signed-in tradie's own request link. Only renders the
 * caller's slug so it can't be used to mint codes for other people's links.
 *
 *   ?format=svg (default)  crisp vector for sign writers and print
 *   ?format=png&size=1024  raster for social posts, email signatures, phones
 *   ?logo=1                (png) the business logo in the middle of the code
 *   ?download=1            send as a file instead of showing inline
 *
 * With a logo the code is generated at error-correction H, which tolerates
 * the ~22 % of the pattern the logo covers.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Image work plus an outbound logo fetch per call: cap it like the other cost-bearing routes.
  const quota = consumeFixedWindow(`request-qr:${user.id}`, 60, 15 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  const { data: profile } = await supabase
    .from("profiles")
    .select("request_slug, logo_url")
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
  const wantLogo = params.get("logo") === "1";
  const size = Math.min(2048, Math.max(256, Number(params.get("size")) || 512));
  const logoUrl = typeof profile?.logo_url === "string" && /^https:\/\//i.test(profile.logo_url) ? profile.logo_url : null;
  const withLogo = wantLogo && format === "png" && Boolean(logoUrl);
  const options = { errorCorrectionLevel: (withLogo ? "H" : "M") as "H" | "M", margin: 2, width: size, color: { dark: "#111111", light: "#ffffff" } };
  const filename = `tradies2quote-request-${slug}.${format}`;
  const headers: Record<string, string> = {
    "cache-control": "private, max-age=300",
    ...(download ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
  };
  if (format === "png") {
    let png: Buffer = await QRCode.toBuffer(link, { ...options, type: "png" });
    if (withLogo && logoUrl) {
      try {
        const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const logo = Buffer.from(await res.arrayBuffer());
          const badge = Math.round(size * 0.24);
          const inner = Math.round(badge * 0.8);
          const logoPng = await sharp(logo).resize(inner, inner, { fit: "inside", withoutEnlargement: false }).png().toBuffer();
          const meta = await sharp(logoPng).metadata();
          const plate = await sharp({ create: { width: badge, height: badge, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
            .composite([{ input: logoPng, left: Math.round((badge - (meta.width ?? inner)) / 2), top: Math.round((badge - (meta.height ?? inner)) / 2) }])
            .png().toBuffer();
          // Rounded white plate so the logo never touches the code modules.
          const mask = Buffer.from(`<svg width="${badge}" height="${badge}"><rect width="${badge}" height="${badge}" rx="${Math.round(badge * 0.18)}" fill="#fff"/></svg>`);
          const rounded = await sharp(plate).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
          png = await sharp(png).composite([{ input: rounded, left: Math.round((size - badge) / 2), top: Math.round((size - badge) / 2) }]).png().toBuffer();
        }
      } catch {
        /* Logo unreachable: plain code still downloads. */
      }
    }
    return new NextResponse(new Uint8Array(png), { status: 200, headers: { ...headers, "content-type": "image/png" } });
  }
  const svg = await QRCode.toString(link, { ...options, type: "svg" });
  return new NextResponse(svg, { status: 200, headers: { ...headers, "content-type": "image/svg+xml; charset=utf-8" } });
}
