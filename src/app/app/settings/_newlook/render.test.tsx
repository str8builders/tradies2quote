// New-look settings parts, rendered to static HTML in node (like the kit's
// tests): labels, values, links, and the states each part starts in. The
// rules behind saving and the Save bar are unit-tested in model.test.ts.

import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ saveSettings: vi.fn() }));
vi.mock("../engagement-actions", () => ({ saveEngagementSettings: vi.fn() }));
vi.mock("../payments-actions", () => ({ saveDepositPctAction: vi.fn() }));
vi.mock("../logo-actions", () => ({ uploadBusinessLogoAction: vi.fn(), removeBusinessLogoAction: vi.fn() }));
vi.mock("../request-link-actions", () => ({
  enableQuoteRequestLink: vi.fn(),
  rotateQuoteRequestLink: vi.fn(),
  disableQuoteRequestLink: vi.fn(),
}));
vi.mock("../delete-account-actions", () => ({ deleteAccountAction: vi.fn() }));
vi.mock("@/app/app/_components/account-hub-actions", () => ({ uploadAvatarAction: vi.fn(), removeAvatarAction: vi.fn() }));
vi.mock("@/app/app/quotes/new/ai-consent-actions", () => ({ withdrawAiConsentAction: vi.fn() }));
vi.mock("@/lib/imagePrep", () => ({ prepareLogoImage: vi.fn(), prepareAvatarImage: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));

import { ToastProvider } from "@/components/ui/toast";
import { AiConsentCard } from "./AiConsentCard";
import { AvatarField, avatarInitial } from "./AvatarField";
import { BusinessForm } from "./BusinessForm";
import { DeleteAccountCard } from "./DeleteAccountCard";
import { settingsHubItems } from "./hub";
import { LoadFailed } from "./LoadFailed";
import type { SettingsValues } from "./model";
import { NotificationsSetting } from "./NotificationsSetting";
import { OutdoorSetting } from "./OutdoorSetting";
import { PaymentsForm } from "./PaymentsForm";
import { PlanCard } from "./PlanCard";
import { planSummary } from "./plan";
import { RatesForm } from "./RatesForm";
import { RequestLinkCard, requestLinkUrl } from "./RequestLinkCard";
import { SaveBar } from "./SaveBar";
import { SettingsHub } from "./SettingsHub";
import { SettingsScreen } from "./SettingsScreen";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const withToasts = (children: ReactNode) => html(<ToastProvider>{children}</ToastProvider>);

/** The opening tag of the element that holds a fragment. */
const tagWith = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const NZ: SettingsValues = {
  business_name: "Bayside Builders",
  email: "mike@bayside.co.nz",
  phone: "021 555 0101",
  address: "12 Rata St, Tauranga",
  gst_number: "123-456-789",
  payment_instructions: "Bank: 12-3456-7890123-00",
  currency: "NZD",
  country: "NZ",
  tax_rate: "15",
  default_labour_rate: "85",
  default_markup_pct: "20",
};
const UK: SettingsValues = { ...NZ, country: "UK", currency: "GBP", tax_rate: "20" };

describe("frame", () => {
  it("every page goes back to More, and leaves room for the Save bar", () => {
    const out = html(
      <SettingsScreen title="Business details" saveBar>
        <p>body</p>
      </SettingsScreen>,
    );
    expect(tagWith(out, 'href="/app/more"')).toContain("<a");
    expect(out).toContain(">More<");
    expect(out).toMatch(/<h1[^>]*>Business details<\/h1>/);
    expect(out).toContain("pb-32");
    expect(out).toContain('role="status"');
  });

  it("the hub lists the four pages as tappable rows", () => {
    const out = html(<SettingsHub items={settingsHubItems({ taxLabel: "GST", native: false })} />);
    for (const path of ["business", "rates", "payments", "account"]) {
      expect(tagWith(out, `href="/app/settings/${path}"`)).toContain("min-h-16");
    }
    expect(out).toContain(">Settings</h1>");
    expect(out).toContain("GST number");
  });

  it("the Save bar is there only with changes, and submits its form", () => {
    expect(html(<SaveBar dirty={false} pending={false} />)).toBe("");
    const bar = html(<SaveBar dirty pending={false} />);
    expect(bar).toContain('data-testid="settings-save-bar"');
    expect(tagWith(bar, 'data-testid="settings-save"')).toContain('type="submit"');
    expect(bar).toContain("min-h-14");
    expect(bar).toContain("bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))]");
    expect(bar).toContain("motion-reduce:animate-none");
    const saving = html(<SaveBar dirty={false} pending />);
    expect(saving).toContain('aria-busy="true"');
    expect(saving).toContain("Saving…");
  });

  it("a failed load offers a full reload instead of a form", () => {
    const out = html(<LoadFailed retryHref="/app/settings/rates" />);
    expect(out).toContain("Couldn&#x27;t load your settings");
    expect(tagWith(out, 'data-testid="settings-load-retry"')).toContain('href="/app/settings/rates"');
  });
});

describe("Business details", () => {
  it("shows the five fields with their loaded values and one-line help, no Save bar yet", () => {
    const out = withToasts(<BusinessForm initial={NZ} loadedTaxLabel="GST" logoUrl={null} />);
    for (const label of ["Business name", "Phone", "Email", "Address", "GST number"]) {
      expect(out).toContain(`>${label}</label>`);
    }
    expect(tagWith(out, 'data-testid="settings-business-name"')).toContain('value="Bayside Builders"');
    expect(tagWith(out, 'data-testid="settings-phone"')).toContain('type="tel"');
    expect(tagWith(out, 'data-testid="settings-email"')).toContain('value="mike@bayside.co.nz"');
    expect(out).toContain("When a client replies to a quote or invoice, it comes here.");
    expect(out).not.toContain('data-testid="settings-save-bar"');
    expect(out).toContain("Add your logo");
    expect(out).toContain("No logo yet");
  });

  it("a UK business sees VAT", () => {
    const out = withToasts(<BusinessForm initial={UK} loadedTaxLabel="GST" logoUrl={null} />);
    expect(out).toContain(">VAT number</label>");
    expect(out).not.toContain("GST number");
  });

  it("with a logo: preview, change and remove", () => {
    const out = withToasts(<BusinessForm initial={NZ} loadedTaxLabel="GST" logoUrl="https://cdn.example/logo.png" />);
    expect(out).toContain('src="https://cdn.example/logo.png"');
    expect(out).toContain("Change logo");
    expect(out).toContain("Remove logo");
    expect(tagWith(out, 'data-testid="settings-logo-input"')).toContain('type="file"');
  });
});

describe("Rates and quotes", () => {
  const render = (values: SettingsValues, extra: Partial<Parameters<typeof RatesForm>[0]> = {}) =>
    withToasts(<RatesForm initial={values} loadedTaxLabel="GST" engagement={null} {...extra} />);

  it("labour rate, markup (worded for what it covers), country, tax rate and currency", () => {
    const out = render(NZ);
    expect(out).toContain(">Labour rate</label>");
    expect(out).toContain(">an hour<");
    expect(tagWith(out, 'data-testid="settings-labour-rate"')).toContain('value="85"');
    expect(tagWith(out, 'data-testid="settings-labour-rate"')).toContain('inputMode="decimal"');
    expect(out).toContain(">Markup on materials and other items</label>");
    expect(out).toContain(">Country</label>");
    expect(out).toMatch(/<option value="NZ" selected="">New Zealand<\/option>/);
    expect(out).toContain(">GST rate</label>");
    expect(out).toContain("Leave it empty to use 15%, the usual rate.");
    expect(out).toMatch(/<option value="NZD" selected="">/);
    expect(out).not.toContain('data-testid="settings-save-bar"');
  });

  it("follows a UK business: VAT, pounds, 20%", () => {
    const out = render(UK);
    expect(out).toContain(">VAT rate</label>");
    expect(out).toContain(">£<");
    expect(out).toContain("use 20%");
  });

  it("links to the terms templates and says how long quotes last", () => {
    const out = render(NZ);
    expect(tagWith(out, 'href="/app/templates"')).toContain("min-h-16");
    expect(out).toContain("Quotes are valid for 30 days.");
  });

  it("places the request link card, and follow-ups only when switched on", () => {
    const out = render(NZ, { requestLink: <p data-testid="slot">request link here</p> });
    expect(out).toContain("request link here");
    expect(out).not.toContain("Follow-ups and reviews");

    const both = render(NZ, {
      engagement: {
        show: { reviews: true, followups: true },
        initial: { googleReviewUrl: "https://g.page/r/abc/review", autoReview: true, autoFollowup: false },
      },
    });
    expect(both).toContain("Follow-ups and reviews");
    expect(both).toContain("Chase quotes for me");
    expect(both).toContain('value="https://g.page/r/abc/review"');
    expect(both).toMatch(/aria-checked="true"[^>]*aria-labelledby="[^"]*"/);

    const followOnly = render(NZ, {
      engagement: { show: { reviews: false, followups: true }, initial: { googleReviewUrl: "", autoReview: false, autoFollowup: true } },
    });
    expect(followOnly).toContain("Chase quotes for me");
    expect(followOnly).not.toContain("Your Google review link");
  });
});

describe("Your request link", () => {
  it("builds the public link from the app address", () => {
    expect(requestLinkUrl("https://tradies2quote.com/", "bayside")).toBe("https://tradies2quote.com/r/bayside");
    expect(requestLinkUrl("https://tradies2quote.com", null)).toBeNull();
  });

  it("on: the link, copy and open, the QR code, poster and downloads", () => {
    const out = withToasts(
      <RequestLinkCard initialSlug="bayside-builders" appUrl="https://tradies2quote.com" hasBusinessName hasLogo />,
    );
    expect(out).toContain("https://tradies2quote.com/r/bayside-builders");
    expect(out).toContain("Copy link");
    expect(out).toContain('src="/api/account/request-qr?v=bayside-builders"');
    expect(tagWith(out, 'data-testid="request-poster-link"')).toContain('href="/print/request-poster"');
    expect(tagWith(out, 'data-testid="request-qr-png"')).toContain("&amp;logo=1");
    expect(out).toContain('href="/app/requests"');
    expect(out).toContain("Get a new link");
    expect(out).toContain("Turn the link off");
  });

  it("off, with no business name yet: points to Business details first", () => {
    const out = withToasts(
      <RequestLinkCard initialSlug={null} appUrl="https://tradies2quote.com" hasBusinessName={false} hasLogo={false} />,
    );
    expect(tagWith(out, 'data-testid="request-link-enable"')).toContain("disabled");
    expect(out).toContain('href="/app/settings/business"');
    expect(out).not.toContain("/api/account/request-qr");
  });
});

describe("Payments", () => {
  it("the invoice payment wording, with a count to 500", () => {
    const out = withToasts(<PaymentsForm initial={NZ} cardPayments={null} />);
    expect(out).toContain(">Bank details and how to pay</label>");
    expect(tagWith(out, 'data-testid="settings-payment-instructions"')).toContain('maxLength="500"');
    expect(out).toContain("Bank: 12-3456-7890123-00</textarea>");
    expect(out).toContain("24 of 500");
    expect(out).not.toContain("Card payments and deposits");
  });

  it("card payments: set up, finish setup, then the deposit", () => {
    const off = withToasts(
      <PaymentsForm initial={NZ} cardPayments={{ connected: false, chargesEnabled: false, detailsSubmitted: false, depositPct: 50 }} />,
    );
    expect(off).toContain("Set up card payments");
    const half = withToasts(
      <PaymentsForm initial={NZ} cardPayments={{ connected: true, chargesEnabled: false, detailsSubmitted: false, depositPct: 50 }} />,
    );
    expect(half).toContain("Finish the Stripe setup");
    expect(half).toContain("Stripe needs a few more details");
    const on = withToasts(
      <PaymentsForm initial={NZ} cardPayments={{ connected: true, chargesEnabled: true, detailsSubmitted: true, depositPct: 30 }} />,
    );
    expect(on).toContain("Card payments are on");
    expect(tagWith(on, 'data-testid="settings-deposit-pct"')).toContain('value="30"');
    expect(tagWith(on, 'data-testid="settings-deposit-pct"')).toContain('inputMode="numeric"');
  });

  it("the plan goes where the page puts it", () => {
    const out = withToasts(<PaymentsForm initial={NZ} cardPayments={null} plan={<p>plan here</p>} />);
    expect(out).toContain("plan here");
  });

  it("plan card: manage billing when paid, choose a plan in a trial", () => {
    const status = {
      state: "paid" as const,
      plan: "solo" as const,
      trialEndsAt: new Date(),
      trialDaysLeft: null,
      currentPeriodEnd: null,
      stripeCustomerId: "cus_1",
    };
    const paid = html(<PlanCard summary={planSummary(status, true)} />);
    expect(paid).toContain("Tradies2Quote Solo");
    expect(paid).toContain("Manage billing");
    const trial = html(
      <PlanCard summary={planSummary({ ...status, state: "trialing", trialDaysLeft: 4, stripeCustomerId: null }, true)} />,
    );
    expect(tagWith(trial, 'data-testid="settings-choose-plan"')).toContain('href="/app/upgrade"');
  });
});

describe("Your account", () => {
  it("photo: the initial until there is one, and who is signed in", () => {
    expect(avatarInitial("mike@bayside.co.nz")).toBe("M");
    expect(avatarInitial(null)).toBe("?");
    const out = withToasts(<AvatarField avatarUrl={null} email="mike@bayside.co.nz" />);
    expect(out).toContain(">M</span>");
    expect(out).toContain("mike@bayside.co.nz");
    expect(out).toContain("Add a photo");
    expect(out).not.toContain("Remove photo");
    const withPhoto = withToasts(<AvatarField avatarUrl="https://cdn.example/me.jpg" email="mike@bayside.co.nz" />);
    expect(withPhoto).toContain('src="https://cdn.example/me.jpg"');
    expect(withPhoto).toContain("Change photo");
  });

  it("notifications start by checking the phone, switch held", () => {
    const out = html(<NotificationsSetting />);
    expect(out).toContain("Quote notifications");
    expect(out).toContain("Checking this phone…");
    expect(tagWith(out, 'role="switch"')).toContain("disabled");
  });

  it("outdoor mode, worded for bright sun, starts as the server saw it", () => {
    const on = html(<OutdoorSetting initialOn />);
    expect(on).toContain("Outdoor mode");
    expect(on).toContain("High contrast for bright sun.");
    expect(tagWith(on, 'role="switch"')).toContain('aria-checked="true"');
    expect(tagWith(html(<OutdoorSetting initialOn={false} />), 'role="switch"')).toContain('aria-checked="false"');
  });

  it("AI consent: the disclosure, and a way to withdraw once given", () => {
    const given = withToasts(<AiConsentCard consentedAt="2026-09-01T00:00:00Z" />);
    expect(given).toContain("Anthropic (Claude)");
    expect(given).toContain("Withdraw AI consent");
    expect(withToasts(<AiConsentCard consentedAt={null} />)).not.toContain("Withdraw AI consent");
  });

  it("delete account starts closed: one button, no typing box yet", () => {
    const out = html(<DeleteAccountCard />);
    expect(out).toContain("Delete my account");
    expect(out).not.toContain("Type DELETE to confirm");
    expect(out).not.toContain("Delete forever");
  });
});
