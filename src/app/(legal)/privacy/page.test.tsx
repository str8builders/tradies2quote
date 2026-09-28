import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LEGAL } from "@/lib/legal";
import PrivacyPage from "./page";

// The Cookies section used to say only "a small analytics script also
// runs" — no name, no host, no account of what it collects. It's
// UptimeWatch (uptimewatch-vert.vercel.app); read its live script for what
// it actually sends (src/app/_components/CookieConsent.tsx names the host).
describe("privacy policy — Cookies section names the analytics provider", () => {
  const html = renderToStaticMarkup(<PrivacyPage />);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("names the host and what it collects", () => {
    expect(text).toContain("UptimeWatch");
    expect(text).toContain("uptimewatch-vert.vercel.app");
    expect(text).toMatch(/error message.*stack trace/);
    expect(text).toContain("Core Web Vitals");
  });

  it("points at the footer's withdrawal control", () => {
    expect(text).toContain("Cookie settings");
  });

  it("shows the current last-updated date", () => {
    expect(text).toContain(LEGAL.privacyLastUpdatedDisplay);
  });
});
