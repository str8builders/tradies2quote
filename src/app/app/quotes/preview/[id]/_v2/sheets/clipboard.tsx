"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { Button, type ButtonVariant } from "@/components/ui/button";

/** Copy text; false when the phone or browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies on tap and says so on the button itself (a toast would sit behind
 * an open sheet). If copying is refused it says how to copy by hand.
 */
export function CopyButton({
  text,
  children,
  icon,
  variant = "ghost",
  failHint = "Couldn't copy. Press and hold to copy it.",
}: {
  text: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  failHint?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);
  return (
    <div>
      <Button
        variant={variant}
        fullWidth
        icon={state === "copied" ? <Check weight="bold" /> : icon}
        onClick={async () => setState((await copyText(text)) ? "copied" : "failed")}
      >
        {state === "copied" ? "Copied" : children}
      </Button>
      {state === "failed" ? (
        <p role="alert" className="mt-1 text-ui-sm text-ui-muted">
          {failHint}
        </p>
      ) : null}
    </div>
  );
}
