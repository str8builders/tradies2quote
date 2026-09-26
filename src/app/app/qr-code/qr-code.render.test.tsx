// Your QR code (/app/qr-code): markup contracts in node (static HTML).

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../settings/request-link-actions", () => ({
  enableQuoteRequestLink: vi.fn(),
  rotateQuoteRequestLink: vi.fn(),
  disableQuoteRequestLink: vi.fn(),
}));

import { ToastProvider } from "@/components/ui/toast";
import { markupRuleBreaks } from "@/test/design-rules";
import { legacyTopBar } from "../_v2/lib/app-nav";
import { QR_GUIDE } from "./_lib/guide";
import { QrCodeView } from "./_components/QrCodeView";

const html = (node: ReactNode) => renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);

/** The opening tag of the element that holds a fragment. */
const tagWith = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const view = (over: Partial<Parameters<typeof QrCodeView>[0]> = {}) =>
  html(
    <QrCodeView
      initialSlug="bayside-builders"
      appUrl="https://tradies2quote.com"
      hasBusinessName
      hasLogo
      inApp={false}
      {...over}
    />,
  );

describe("Your QR code", () => {
  it("has its own title, with the way back to Home", () => {
    expect(legacyTopBar("/app/qr-code", "Your QR code")).toEqual({ title: "Your QR code", back: { href: "/app", label: "Home" } });
  });

  it("on: the code big enough to scan off the phone, the link, copy and open", () => {
    const out = view();
    expect(tagWith(out, 'data-testid="qr-code-image"')).toContain('src="/api/account/request-qr?v=bayside-builders"');
    expect(out).toContain("scan it straight off your phone");
    expect(out).toContain(">tradies2quote.com/r/bayside-builders</p>");
    expect(out).toContain("Copy link");
    expect(out).toContain('href="https://tradies2quote.com/r/bayside-builders"');
  });

  it("on: the van sticker and the poster to print, and the files for a sign-writer", () => {
    const out = view();
    expect(tagWith(out, 'data-testid="qr-print-sticker"')).toContain('href="/print/request-sticker"');
    expect(tagWith(out, 'data-testid="qr-print-poster"')).toContain('href="/print/request-poster"');
    expect(tagWith(out, 'data-testid="qr-download-png"')).toContain("format=png&amp;size=1024&amp;logo=1&amp;download=1");
    expect(tagWith(out, 'data-testid="qr-download-svg"')).toContain('href="/api/account/request-qr?download=1"');
    expect(out).not.toContain('data-testid="qr-share"');
    // The logo is already in: no nudge to add it.
    expect(out).not.toContain("Add your logo");
    expect(view({ hasLogo: false })).toContain("Add your logo");
    expect(view({ hasLogo: false })).not.toContain("logo=1");
  });

  it("on: the how-to in five steps, the warning about a new link, and where to manage it", () => {
    const out = view();
    const guide = out.slice(out.indexOf('data-testid="qr-guide"'));
    expect(QR_GUIDE.map((step) => step.id)).toEqual(["print", "place", "size", "test", "requests"]);
    for (const step of QR_GUIDE) expect(guide).toContain(`data-step="${step.id}"`);
    expect(guide).toContain("outdoor vinyl sticker paper");
    expect(guide).toContain("outside of the glass");
    expect(out).toContain("Keep this link");
    expect(out).toContain('href="/app/requests"');
    expect(tagWith(out, 'data-testid="qr-link-settings"')).toContain('href="/app/settings/rates#request-link"');
  });

  it("in the iPhone app: the share sheet instead of print pages and downloads", () => {
    const out = view({ inApp: true });
    expect(out).toContain('data-testid="qr-share"');
    expect(out).toContain("Share or print the QR code");
    expect(out).toContain('data-testid="qr-print-in-app"');
    expect(out).not.toContain("/print/request-sticker");
    expect(out).not.toContain("/print/request-poster");
    expect(out).not.toContain("download=1");
    expect(out).toContain('data-testid="qr-guide"');
  });

  it("off: turn it on (needs the business name first), with the how-to below", () => {
    const off = view({ initialSlug: null });
    expect(off).toContain('data-testid="qr-code-off"');
    expect(tagWith(off, 'data-testid="qr-code-enable"')).not.toContain("disabled");
    expect(off).not.toContain("/api/account/request-qr");
    expect(off).toContain('data-testid="qr-guide"');
    const noName = view({ initialSlug: null, hasBusinessName: false });
    expect(tagWith(noName, 'data-testid="qr-code-enable"')).toContain("disabled");
    expect(noName).toContain('href="/app/settings/business"');
  });

  it("no plan or price talk (the same page in the iPhone app)", () => {
    for (const out of [view(), view({ inApp: true }), view({ initialSlug: null })]) {
      const words = out.replace(/<[^>]*>/g, " ");
      expect(words).not.toMatch(/\bplans?\b|subscri|upgrade|trial|\$/i);
    }
  });

  it("follows the new look's design rules", () => {
    for (const out of [view(), view({ inApp: true }), view({ initialSlug: null, hasBusinessName: false })]) {
      expect(markupRuleBreaks(out)).toEqual([]);
    }
  });
});
