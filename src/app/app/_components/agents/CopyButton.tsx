"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Small copy-to-clipboard button shared by every agent panel.
 *
 * The text it copies is fully passed in as a prop. The button never
 * reads or writes anything else. Two-second "copied" pill, then resets.
 *
 * `look="new"` draws it as a small secondary kit button (the new-look job
 * page); what it copies and when is the same for both looks.
 */
interface Props {
  text: string;
  label?: React.ReactNode;
  testId?: string;
  disabled?: boolean;
  look?: "classic" | "new";
}

export function CopyButton({
  text,
  label = "Copy",
  testId,
  disabled = false,
  look = "classic",
}: Props) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fall back: select the text in a hidden textarea + use execCommand.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* clipboard blocked entirely — give up silently */
      }
      document.body.removeChild(ta);
    }
  }

  if (look === "new") {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
        icon={copied ? <Check weight="bold" /> : <Copy weight="bold" />}
        className="shrink-0"
      >
        {copied ? "Copied" : label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-ink-600 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-200 transition-colors hover:border-brand hover:bg-brand hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied ? (
        <>
          <Check size={14} weight="bold" />
          Copied
        </>
      ) : (
        <>
          <Copy size={14} weight="bold" />
          {label}
        </>
      )}
    </button>
  );
}
