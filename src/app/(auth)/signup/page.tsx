import type { Metadata } from "next";
import { AuthSplitShell } from "../../_components/auth/AuthSplitShell";
import { AuthMarketingPanel } from "../../_components/auth/AuthMarketingPanel";
import { SignupForm } from "./_components/SignupForm";
import { isNativeShellRequest } from "@/lib/native-shell";

/** The tab title is in the HTML too: inside the iOS app no "free trial" (App Store 3.1.3(f)). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await isNativeShellRequest()) ? "Create account" : "Start your free trial" };
}

/**
 * /signup — split-screen sign-up.
 *
 * Visual side (LEFT, hidden on mobile): "Onboard the crew" eyebrow,
 * "Start free." headline, 4-bullet benefits list, "1,243 tradies" ticker.
 * Form side (RIGHT): "Sign up" eyebrow, "Build your account" headline,
 * email + password only (the only fields `signupAction` persists today).
 *
 * Server-rendered. The form is a small client subcomponent
 * (`SignupForm`) which owns the password show/hide toggle and submits to
 * the unchanged Supabase `signupAction`. Decorative name/business/trade
 * fields are deferred until `actions.ts` can persist them.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const native = await isNativeShellRequest();

  return (
    <AuthSplitShell
      native={native}
      backHref="/"
      visual={<AuthMarketingPanel kind="signup" />}
      form={
        <>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand mb-3">
            {"// sign up"}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-tighter leading-[0.95]">
            Build your <span className="text-brand">account.</span>
          </h1>
          <p className="text-ink-300 mt-3">
            Email and password — that&apos;s all we need to get you started.
          </p>

          <div className="mt-8">
            <SignupForm error={error} next={next} native={native} />
          </div>
        </>
      }
    />
  );
}
