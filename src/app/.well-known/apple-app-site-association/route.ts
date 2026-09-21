import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
/** Configure the distribution App ID prefix; never associate a guessed team. */
export function GET() {
  const prefix = process.env.APPLE_APP_ID_PREFIX?.trim();
  if (!prefix || !/^[A-Z0-9]{10}$/.test(prefix)) return NextResponse.json({ error: "Association not configured" }, { status: 503 });
  return NextResponse.json({ applinks: { details: [{ appIDs: [`${prefix}.com.str8builders.tradies2quote`], components: [{ "/": "/app/quotes/preview/*", comment: "Open a quote received from the separate calculator app" }] }] } }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
