// Privacy, Terms and Support inside the iPhone app (reached from the photo
// menu and the sign-in screens): the way back is the app, no website footer,
// no trial, plan or billing talk (App Store 3.1.3(f)), no install guide for
// other phones (2.3.10). The privacy policy is the same everywhere and says
// where data really lives (5.1.1(i)). The website is unchanged.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));

import LegalLayout from "./layout";
import PrivacyPage from "./privacy/page";
import SupportPage from "./support/page";
import TermsPage from "./terms/page";

const html = (node: ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const sectionNumbers = (markup: string) =>
  [...markup.matchAll(/tracking-\[0\.25em\] text-brand">(\d\d)<\/span>/g)].map((m) => m[1]);

beforeEach(() => {
  h.native = false;
});

describe("legal layout", () => {
  it("in the iPhone app: back to the app, and no website footer (trial, install and homepage links)", async () => {
    h.native = true;
    const out = html(await LegalLayout({ children: <p>Body</p> }));
    expect(out).toContain('href="/app"');
    expect(out).toContain("Back to the app");
    expect(out).not.toContain('data-testid="site-footer"');
    expect(out).not.toMatch(/href="\/(install|signup|#pricing)"/);
    expect(out).not.toMatch(/Start trial|Install the app|Back to site/);
  });

  it("on the website: back to the site and the footer, as before", async () => {
    const out = html(await LegalLayout({ children: <p>Body</p> }));
    expect(out).toContain("Back to site");
    expect(out).toContain('data-testid="site-footer"');
    expect(out).toContain('href="/install"');
  });
});

describe("terms", () => {
  it("in the iPhone app: no free-trial, plans or cancellation sections, numbered 01 to 16", async () => {
    h.native = true;
    const out = html(await TermsPage());
    expect(out).not.toMatch(/id="(trial|billing|cancellation)"/);
    expect(out).not.toMatch(/Free trial|Plans &amp; billing|pricing page|auto-renew|Cancel any time|on current plans/);
    expect(sectionNumbers(out)).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0")));
  });

  it("on the website: all 19 sections, numbered as before", async () => {
    const out = html(await TermsPage());
    expect(out).toContain('id="trial"');
    expect(out).toContain("Cancel any time.");
    expect(out).toContain("on current plans.");
    expect(sectionNumbers(out)).toEqual(Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, "0")));
  });
});

describe("support", () => {
  it("in the iPhone app: no billing card, and the app's own microphone and delete steps", async () => {
    h.native = true;
    const out = text(html(await SupportPage()));
    expect(out).not.toMatch(/Trial, plans|free trial|Paid plans/);
    expect(out).toContain("open the iPhone's Settings, then Tradies2Quote, and turn Microphone on");
    expect(out).toContain("tap your photo at the top left, choose Your profile");
    expect(out).not.toContain("AA icon");
  });

  it("on the website: the billing card and Safari steps as before", async () => {
    const out = text(html(await SupportPage()));
    expect(out).toContain("Trial, plans & billing");
    expect(out).toContain("AA icon");
  });
});

describe("privacy policy", () => {
  it("hosting in Sydney, Australia (never France), dated 26 September 2026", () => {
    const out = text(html(PrivacyPage()));
    expect(out).toContain("Last updated 26 September 2026");
    expect(out).toContain("Sydney, Australia");
    expect(out).not.toMatch(/France|European Union\)/);
  });

  it("a Location section that says what, when, who sees it, for how long, and how to turn it off", () => {
    const markup = html(PrivacyPage());
    expect(markup).toContain('id="location"');
    const out = text(markup);
    for (const phrase of [
      "At the Hemi Walker job",
      "precise while the app is open, and rough while it's in the background",
      "iOS region monitoring",
      "Always",
      "Outside your work hours nothing happens",
      "the business owner can see your hours, where you clocked in and out, and where you were while you were clocked in",
      "route points are deleted after 90 days",
      "Nominatim",
      "OpenStreetMap map tiles",
      "rounded to about 1 km",
      "Open-Meteo",
      "turn location off at any time in the Timesheet",
    ]) {
      expect(out).toContain(phrase);
    }
  });

  it("no paid-plan or website-billing talk; the processors are all still named", () => {
    const out = text(html(PrivacyPage()));
    expect(out).not.toMatch(/paid plans|billed on our website/i);
    for (const name of ["Contabo GmbH", "Anthropic", "OpenAI", "Open-Meteo", "OpenStreetMap", "Stripe", "Resend", "Apple"]) {
      expect(out).toContain(name);
    }
  });

  it("the iPhone app loads no analytics, and the policy says so", () => {
    expect(text(html(PrivacyPage()))).toContain("The iPhone app uses essential cookies only");
  });
});
