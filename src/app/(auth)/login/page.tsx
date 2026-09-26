import type { Metadata } from "next";
import { AuthSplitShell } from "../../_components/auth/AuthSplitShell";
import { AuthMarketingPanel } from "../../_components/auth/AuthMarketingPanel";
import { LoginForm } from "./_components/LoginForm";
import { isNativeShellRequest } from "@/lib/native-shell";

export const metadata: Metadata = {
  title: "Log in",
};

/**
 * /login — split-screen sign-in.
 *
 * Visual side (RIGHT, hidden on mobile, mirrors the /signup left panel
 * inverted): "// for the tools" eyebrow, "Voice in. Quote out." headline,
 * 3-bullet trust list, "1,243 tradies" ticker.
 * Form side (LEFT): "// sign in" eyebrow, "Welcome back" headline,
 * email/password form, forgot-password + signup links.
 *
 * Server-rendered. Form lives in a small client subcomponent
 * (`LoginForm`) which owns the eye-toggle + magnetic CTA hooks; it
 * submits to the unchanged Supabase `loginAction` server action with
 * email + password + optional `next`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;
  const native = await isNativeShellRequest();

  return (
    <AuthSplitShell
      native={native}
      backHref="/"
      reverse
      visual={<AuthMarketingPanel kind="signin" />}
      form={
        <>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand mb-3">
            {"// sign in"}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-tighter leading-[0.95]">
            Welcome <span className="text-brand">back.</span>
          </h1>
          <p className="text-ink-300 mt-3">Pick up where you left off.</p>

          <div className="mt-8">
            <LoginForm next={next} error={error} message={message} native={native} />
          </div>
        </>
      }
    />
  );
}
