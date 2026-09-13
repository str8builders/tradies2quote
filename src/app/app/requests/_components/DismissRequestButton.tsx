"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, X } from "@phosphor-icons/react";
import { setQuoteRequestDismissed } from "../actions";

export function DismissRequestButton({ id, dismissed }: { id: string; dismissed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <span className="inline-flex flex-col items-end gap-1">
    <button type="button" className="t2q-btn-ghost-pro" disabled={pending} data-testid={dismissed ? "request-restore" : "request-dismiss"}
      onClick={() => start(async () => { setError(""); const r = await setQuoteRequestDismissed(id, !dismissed); if (!r.ok) setError(r.error); else router.refresh(); })}>
      {dismissed ? <><ArrowCounterClockwise size={16} weight="bold" />Restore</> : <><X size={16} weight="bold" />Dismiss</>}
    </button>
    {error ? <span role="alert" className="text-xs text-red-300">{error}</span> : null}
  </span>;
}
