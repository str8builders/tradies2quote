export function GET() {
  return Response.json({
    id: "/t2qcal", name: "T2QCAL", short_name: "T2QCAL",
    description: "Visual construction calculators connected to Tradies2Quote",
    start_url: "/t2qcal/calculators", scope: "/t2qcal/", display: "standalone",
    theme_color: "#0a0a0a", background_color: "#0a0a0a",
    categories: ["productivity", "utilities"],
    icons: [{ src: "/t2qcal/native-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" }],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
