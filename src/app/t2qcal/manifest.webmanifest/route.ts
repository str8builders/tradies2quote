export function GET() {
  return Response.json({
    id: "/t2qcal", name: "T2QCAL", short_name: "T2QCAL",
    description: "Visual construction calculators connected to Tradies2Quote",
    start_url: "/t2qcal", scope: "/t2qcal", display: "standalone",
    theme_color: "#0a0a0a", background_color: "#0a0a0a",
    categories: ["productivity", "utilities"],
    icons: [{ src: "/t2qcal/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/t2qcal/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
