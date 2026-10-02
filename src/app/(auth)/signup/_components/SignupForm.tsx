"use client";
import { PendingSubmit } from "../../_components/PendingSubmit";
import { rememberEmail, restoreEmailInto } from "../../_components/remembered-email";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight, Envelope, Lock } from "@phosphor-icons/react";
import { Magnetic } from "../../../_components/landing/Magnetic";
import { AuthBanner } from "../../_components/AuthCard";
import { AuthField } from "../../_components/AuthField";
import { signupAction } from "../actions";

/**
 * Client-side form for /signup.
 *
 * Owns the magnetic CTA wrap (the password's Show / Hide button lives in
 * <AuthField>). Submits to the unchanged Supabase `signupAction` server action
 * with `email` + `password` only — those are the only fields the action reads
 * today.
 *
 * The Emergent visual design also includes decorative fields for "Your
 * name", "Business name", and a "Trade" selector. Those are intentionally
 * NOT rendered here yet because `signupAction` doesn't persist them.
 * Wire them up in `actions.ts` first (e.g. into Supabase
 * `user_metadata.full_name` / `business_name` / `trade`) and then add
 * the visual fields back as a follow-up.
 *
 * Plain, big, high-contrast type for older eyes and bright sun: see
 * redesign.css, "Sign-in pages".
 */
type Props = {
  error?: string;
  next?: string;
  /**
   * Inside the iOS app (isNativeShellRequest, on the server): "Create
   * account", with no trial, price or "free" wording (App Store 3.1.3(f)).
   */
  native?: boolean;
};

export function SignupForm({ error, next, native = false }: Props) {
  const emailRef = useRef<HTMLInputElement>(null);
  // After a reload (an update landed mid-sign-up) or a failed attempt, the
  // email typed a moment ago comes back. Never the password.
  useEffect(() => {
    restoreEmailInto(emailRef.current);
  }, [error]);

  return (
    <form
      action={signupAction}
      onSubmit={(e) => {
        rememberEmail(new FormData(e.currentTarget).get("email"));
        (window as unknown as { uw?: (e: string) => void }).uw?.("signup");
      }}
      className="space-y-5"
      data-testid="signup-form"
    >
      <input type="hidden" name="next" value={next ?? "/app"} />
      {error ? (
        <AuthBanner kind="error" testId="signup-error">
          {error}
        </AuthBanner>
      ) : null}

      <AuthField
        icon={<Envelope aria-hidden="true" size={22} weight="bold" className="text-brand shrink-0" />}
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        testId="signup-email"
        inputRef={emailRef}
      />
      <AuthField
        icon={<Lock aria-hidden="true" size={22} weight="bold" className="text-brand shrink-0" />}
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        testId="signup-password"
        toggleTestId="signup-password-toggle"
        hint="At least 8 characters."
      />

      <Magnetic strength={0.18} fill>
        <PendingSubmit data-testid="signup-submit" pendingLabel="Creating your account…">
          {native ? "Create account" : "Start 7-day trial"} <ArrowRight aria-hidden="true" size={22} weight="bold" />
        </PendingSubmit>
      </Magnetic>

      <p data-auth-fine>
        {native
          ? "By creating an account you agree to our terms and privacy policy"
          : "By signing up you agree to our terms · no card needed"}
      </p>

      <p data-auth-note>
        Already on it?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next ?? "/app")}`}
          data-auth-link
          data-testid="signup-to-login"
        >
          Sign in to your account
        </Link>
      </p>
    </form>
  );
}
