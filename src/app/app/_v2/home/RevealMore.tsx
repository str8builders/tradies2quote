"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * "Show 3 more": the rest of the to-do list, one tap away. Once shown,
 * keyboard focus moves to the first card that appeared, so it isn't lost
 * with the button.
 */
export function RevealMore({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) region.current?.querySelector<HTMLElement>("a[href], button")?.focus();
  }, [open]);

  if (!open) {
    return (
      <Button variant="secondary" fullWidth className="mt-3" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return <div ref={region}>{children}</div>;
}
