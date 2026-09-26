import Link from "next/link";
import { isNativeShellRequest } from "@/lib/native-shell";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resetPasswordAction } from "./actions";
import {
  AuthCard,
  FormError,
  FormField,
  SubmitButton,
} from "../_components/AuthCard";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set a new password",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // In the iPhone app the logo leads back to sign in, not the website's
  // homepage, whose HTML carries its trial offers (App Store 3.1.3(f)).
  const native = await isNativeShellRequest();

  // The user must arrive here with an active session (set by the auth callback
  // after they click the email link). If not, send them to /forgot-password.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/forgot-password?error=Reset%20link%20expired%20or%20invalid.%20Request%20a%20new%20one.",
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-ink-900 text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 t2q-grid-bg opacity-30" />
      <div className="pointer-events-none absolute -top-40 -right-40 w-[480px] h-[480px] rounded-full bg-brand/20 blur-3xl animate-blob" />

      <header className="relative z-10 border-b border-ink-600">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Link
            href={native ? "/login" : "/"}
            aria-label={native ? "Back to sign in" : "tradies2Quote home"}
            className="inline-flex w-fit items-center rounded-lg bg-[#0A0A0A] px-2.5 py-1.5"
          >
            {/* Dark plate so the near-white T/Q glyphs stay legible on the
                cream light-theme background (literal #0A0A0A, not
                bg-ink-950 which the light theme remaps to cream). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-horizontal.webp"
              alt="Tradies2Quote"
              width={424}
              height={200}
              className="block h-9 w-auto"
            />
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <AuthCard
            title="Set a new password"
            subtitle="Choose a strong password you don't use elsewhere."
          >
            <form action={resetPasswordAction} className="space-y-4">
              <FormError message={error} />
              <FormField
                label="New password"
                name="password"
                type="password"
                autoComplete="new-password"
              />
              <FormField
                label="Confirm password"
                name="confirm"
                type="password"
                autoComplete="new-password"
              />
              <p className="text-xs text-ink-400">At least 8 characters.</p>
              <SubmitButton>Update password</SubmitButton>
            </form>
          </AuthCard>
        </div>
      </main>
    </div>
  );
}
