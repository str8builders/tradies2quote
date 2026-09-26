// Inside the iPhone app, links never lead to the website's homepage: its
// HTML carries the website's trial offers (App Store 3.1.3(f)), and the app
// would only bounce on from there after they had been sent. The website's
// links are unchanged.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));
vi.mock("@/app/(auth)/forgot-password/actions", () => ({ forgotPasswordAction: vi.fn() }));

import HelpPage from "./help/page";
import ForgotPasswordPage from "./(auth)/forgot-password/page";

const homeLinks = (html: string) => html.match(/<a [^>]*href="\/"/g) ?? [];

beforeEach(() => {
  h.native = false;
});

describe("help (/help)", () => {
  it("in the iPhone app: back to the app, no homepage link", async () => {
    h.native = true;
    const out = renderToStaticMarkup(await HelpPage());
    expect(homeLinks(out)).toHaveLength(0);
    expect(out).toContain('href="/app"');
  });

  it("on the website: the homepage link as before", async () => {
    expect(homeLinks(renderToStaticMarkup(await HelpPage()))).toHaveLength(1);
  });
});

describe("forgot password", () => {
  it("in the iPhone app the logo goes back to sign in", async () => {
    h.native = true;
    const out = renderToStaticMarkup(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(homeLinks(out)).toHaveLength(0);
    expect(out).toMatch(/<a [^>]*aria-label="Back to sign in"[^>]*href="\/login"/);
  });

  it("on the website the logo goes home as before", async () => {
    const out = renderToStaticMarkup(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(homeLinks(out)).toHaveLength(1);
  });
});
