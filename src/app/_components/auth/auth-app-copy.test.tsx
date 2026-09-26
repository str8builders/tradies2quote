// Sign in and sign up inside the iPhone app: "Create account" with no trial,
// price or "free" wording (App Store 3.1.3(f)), and the privacy policy and
// terms one tap away (5.1.1(i)). The website's screens are unchanged.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/signup/actions", () => ({ signupAction: vi.fn() }));
vi.mock("@/app/(auth)/login/actions", () => ({ loginAction: vi.fn(), resendConfirmationAction: vi.fn() }));

import { AuthSplitShell } from "./AuthSplitShell";
import { SignupForm } from "@/app/(auth)/signup/_components/SignupForm";
import { LoginForm } from "@/app/(auth)/login/_components/LoginForm";

const TRIAL_TALK = /trial|free|no card|price|\$|plan/i;
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
/** What a person reads: no tags, and not React's inline form-replay script. */
const visible = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ");

describe("AuthSplitShell: privacy and terms links", () => {
  it("in the iPhone app: Privacy policy and Terms at the foot", () => {
    const out = renderToStaticMarkup(<AuthSplitShell native visual={<p>Visual</p>} form={<p>Form</p>} />);
    expect(hrefs(out)).toEqual(["/privacy", "/terms"]);
    expect(out).toContain(">Privacy policy</a>");
    expect(out).toContain(">Terms</a>");
  });

  it("on the website: no new links (unchanged)", () => {
    const out = renderToStaticMarkup(<AuthSplitShell visual={<p>Visual</p>} form={<p>Form</p>} />);
    expect(out).not.toContain("/privacy");
    expect(out).not.toContain("/terms");
  });
});

describe("SignupForm", () => {
  it("in the iPhone app: Create account, no trial or card talk", () => {
    const out = renderToStaticMarkup(<SignupForm native />);
    expect(out).toContain("Create account");
    expect(visible(out)).not.toMatch(TRIAL_TALK);
  });

  it("on the website: the 7-day trial button and fine print as before", () => {
    const out = renderToStaticMarkup(<SignupForm />);
    expect(out).toContain("Start 7-day trial");
    expect(out).toContain("By signing up you agree to our terms · no card needed");
  });
});

describe("LoginForm", () => {
  it("in the iPhone app: Create account instead of Start free", () => {
    const out = renderToStaticMarkup(<LoginForm native />);
    expect(out).toMatch(/data-testid="login-to-signup"[^>]*>Create account</);
    expect(visible(out)).not.toMatch(TRIAL_TALK);
  });

  it("on the website: Start free as before", () => {
    expect(renderToStaticMarkup(<LoginForm />)).toMatch(/data-testid="login-to-signup"[^>]*>Start free</);
  });
});
