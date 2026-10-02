// The sign-in pages (login, sign-up, forgot and reset password) are made to be
// read by older eyes in bright sun: plain sentence-case labels, a Show button
// on every password, banners that announce themselves, full-width buttons, and
// the Text size setting. These tests keep that from sliding back.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "t2q-text" && h.cookie ? { value: h.cookie } : undefined) }),
}));
vi.mock("@/app/(auth)/signup/actions", () => ({ signupAction: vi.fn() }));
vi.mock("@/app/(auth)/login/actions", () => ({ loginAction: vi.fn(), resendConfirmationAction: vi.fn() }));

import type { ReactElement } from "react";
import AuthLayout from "../layout";
import { AuthBanner, FormField } from "./AuthCard";
import { AuthField } from "./AuthField";
import { AuthTextSize } from "./AuthTextSize";
import { LoginForm } from "../login/_components/LoginForm";
import { SignupForm } from "../signup/_components/SignupForm";

beforeEach(() => {
  h.cookie = undefined;
});

describe("<AuthField>", () => {
  it("labels the box in plain words, joined to the input by for and id", () => {
    const html = renderToStaticMarkup(<AuthField label="Email" name="email" type="email" />);
    const id = html.match(/<label for="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/<label [^>]*data-auth-label[^>]*>Email<\/label>/);
    expect(html).not.toMatch(/uppercase|tracking-|font-mono|text-\[\d+px\]/);
  });

  it("gives a password a Show button with the word on it, and no button on other fields", () => {
    const password = renderToStaticMarkup(<AuthField label="Password" name="password" type="password" toggleTestId="pw-toggle" />);
    expect(password).toContain('type="password"');
    expect(password).toMatch(/<button [^>]*aria-label="Show password"[^>]*data-testid="pw-toggle"[^>]*>/);
    expect(password).toContain(">Show</span>");
    expect(renderToStaticMarkup(<AuthField label="Email" name="email" type="email" />)).not.toContain("<button");
  });

  it("turns off capitals, correction and spell check, and ties a hint to the input", () => {
    const html = renderToStaticMarkup(<AuthField label="New password" name="password" type="password" hint="At least 8 characters." />);
    expect(html).toContain('autoCapitalize="none"');
    expect(html).toContain('autoCorrect="off"');
    expect(html).toContain('spellCheck="false"');
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain("At least 8 characters.");
  });

  it("FormField (forgot and reset password) is the same field", () => {
    const html = renderToStaticMarkup(<FormField label="Confirm password" name="confirm" type="password" autoComplete="new-password" />);
    expect(html).toContain("data-auth-box");
    expect(html).toContain("Show password");
    expect(html).toContain('name="confirm"');
    expect(html).toContain('autoComplete="new-password"');
  });
});

describe("<AuthBanner>", () => {
  it("announces an error at once and a notice politely", () => {
    expect(renderToStaticMarkup(<AuthBanner kind="error">Wrong password</AuthBanner>)).toMatch(/role="alert"[^>]*data-auth-banner="error"/);
    expect(renderToStaticMarkup(<AuthBanner kind="notice">Check your email</AuthBanner>)).toMatch(/role="status"[^>]*data-auth-banner="notice"/);
  });
});

describe("the forms", () => {
  it("login keeps its test ids and shows the error as an alert", () => {
    const html = renderToStaticMarkup(<LoginForm error="That email and password don't match." />);
    for (const id of ["login-form", "login-email", "login-password", "login-password-toggle", "login-submit", "login-forgot", "login-to-signup", "login-error"]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    expect(html).toMatch(/role="alert"[^>]*data-testid="login-error"/);
    expect(html).toContain(">Forgot password?</a>");
    expect(html).toContain(">Sign in");
  });

  it("login offers the confirmation resend as plain words in its own panel", () => {
    const html = renderToStaticMarkup(<LoginForm message="Please confirm your email first." />);
    expect(html).toContain('data-testid="resend-confirmation-form"');
    expect(html).toContain("data-auth-panel");
    expect(html).toContain('data-testid="resend-confirmation-email"');
    expect(html).toMatch(/data-testid="resend-confirmation-submit"[^>]*>Send it again</);
  });

  it("sign-up keeps its test ids, the 8 character hint and the fine print", () => {
    const html = renderToStaticMarkup(<SignupForm error="We couldn't create your account." />);
    for (const id of ["signup-form", "signup-email", "signup-password", "signup-password-toggle", "signup-submit", "signup-to-login", "signup-error"]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    expect(html).toContain("At least 8 characters.");
    expect(html).toContain("By signing up you agree to our terms · no card needed");
  });

  it("the main button goes the full width of the form", () => {
    const html = renderToStaticMarkup(<LoginForm />);
    expect(html).toMatch(/<span class="block w-full[^"]*"><span class="block w-full/);
    expect(html).toMatch(/<button type="submit" data-auth-submit/);
  });
});

describe("Text size on the sign-in pages", () => {
  it("the layout carries the saved size, and is the root the control finds", async () => {
    h.cookie = "large";
    const large = (await AuthLayout({ children: null })) as ReactElement<Record<string, unknown>>;
    expect(large.props["data-text"]).toBe("large");
    expect(large.props["data-contrast-root"]).toBe("");
    expect(String(large.props.className)).toContain("studio-auth-pages");

    h.cookie = undefined;
    const normal = (await AuthLayout({ children: null })) as ReactElement<Record<string, unknown>>;
    expect(normal.props["data-text"]).toBeUndefined();
  });

  it("the control opens on the size in the cookie", async () => {
    h.cookie = "xlarge";
    const html = renderToStaticMarkup(await AuthTextSize());
    expect(html).toContain("Text size");
    expect(html).toMatch(/aria-checked="true"[^>]*>Extra large</);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
});

describe("the look in redesign.css", () => {
  const css = readFileSync(join(process.cwd(), "src/app/redesign.css"), "utf8");
  const start = css.indexOf("/* Sign-in pages (login, sign-up, forgot and reset password)");
  const end = css.indexOf("/* Signed-in surfaces:", start);
  const block = css.slice(start, end);
  const rules = [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: m[2] }));
  /** The declarations of the rule that has exactly this selector (alone or in a comma list). */
  const ruleFor = (selector: string) =>
    rules.find((r) => r.selector.split(",").map((part) => part.trim()).includes(selector))?.body ?? "";

  it("exists", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(rules.length).toBeGreaterThan(15);
  });

  it("every font size reads the --text-* variables, so Text size scales it (nothing in px)", () => {
    const sizes = [...block.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(sizes.length).toBeGreaterThan(10);
    for (const size of sizes) expect(size, size).toMatch(/^var\(--text-(xs|sm|base|lg)\)$/);
  });

  it("the words are never under 16px except the hint, fine print, footer and eyebrow", () => {
    const small = ["[data-auth-hint]", "[data-auth-fine]", ".studio-auth-foot", "[data-auth-eyebrow]"];
    for (const rule of rules) {
      const size = rule.body.match(/font-size:\s*var\(--text-(\w+)\)/)?.[1];
      if (!size || small.some((s) => rule.selector.includes(s))) continue;
      expect(["base", "lg"], rule.selector).toContain(size);
    }
    expect(ruleFor('.studio-auth-pages input[data-auth-input]:not([type="checkbox"]):not([type="radio"])')).toMatch(/font-size:\s*var\(--text-lg\)/);
  });

  it("fields, buttons, links and the Show button are at least 44px tall", () => {
    const rem = (body: string) => Number(body.match(/min-height:\s*([\d.]+)rem/)?.[1] ?? 0);
    expect(rem(ruleFor(".studio-auth-pages [data-auth-box]"))).toBeGreaterThanOrEqual(3.5);
    expect(rem(ruleFor('.studio-auth-pages button[data-auth-submit][type="submit"]'))).toBeGreaterThanOrEqual(3.5);
    expect(rem(ruleFor('.studio-auth-pages button[data-auth-secondary][type="submit"]'))).toBeGreaterThanOrEqual(3.5);
    expect(rem(ruleFor(".studio-auth-pages [data-auth-link]"))).toBeGreaterThanOrEqual(2.75);
    expect(rem(ruleFor(".studio-auth-pages [data-auth-toggle]"))).toBeGreaterThanOrEqual(2.75);
  });

  it("the field edge is a real colour, not the faint 12% white it replaced", () => {
    expect(ruleFor(".studio-auth-pages [data-auth-box]")).toMatch(/border:\s*2px solid #8a8a85/);
  });
});

describe("the sign-in sources", () => {
  const files = [
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/login/_components/LoginForm.tsx",
    "src/app/(auth)/signup/page.tsx",
    "src/app/(auth)/signup/_components/SignupForm.tsx",
    "src/app/(auth)/forgot-password/page.tsx",
    "src/app/(auth)/reset-password/page.tsx",
    "src/app/(auth)/_components/AuthCard.tsx",
    "src/app/(auth)/_components/AuthField.tsx",
  ];

  it.each(files)("%s has no text under 12px and no letter-spaced mono capitals for reading", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
    expect(source).not.toMatch(/tracking-\[0\.2[05]em\]/);
  });
});
