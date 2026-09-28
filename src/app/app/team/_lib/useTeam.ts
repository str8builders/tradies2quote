"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlanId } from "@/lib/plans";

export type TeamData = {
  team: { name: string; id: string } | null;
  isOwner: boolean;
  active: boolean;
  plan: PlanId;
  seats: number;
  roster: {
    members: { user_id: string; email: string; owner: boolean }[];
    invitations: { id: string; email: string; expires_at: string }[];
  };
};

/** Leaving the team, or removing someone from it, waiting for a yes. */
export type TeamConfirm = { action: "leave" } | { action: "remove"; userId: string; email: string };

/**
 * Your team: load it from /api/team and run each action there (verify and
 * accept an invitation, create, leave, invite, remove, revoke). Shared by
 * the old look's <TeamManager> and the new look's cards, so both behave the
 * same. The new look asks before leaving or removing someone (`ask`, then
 * `confirmAsk` or `cancelAsk`).
 */
export function useTeam(initialInvite: string) {
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState(initialInvite);
  const [confirming, setConfirming] = useState<TeamConfirm | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/team");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your team.");
    }
  }, []);

  // Refresh state follows an asynchronous API response; this is external data synchronisation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function act(action: string, values: Record<string, string> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.codeSent) {
        setCodeSent(true);
        setNotice("Check your inbox for an 8-digit verification code.");
      } else if (d.link) setLink(d.link);
      else setNotice(action === "accept" ? "You have joined the team." : "Changes saved.");
      if (action === "accept") {
        setInvite("");
        window.history.replaceState(window.history.state, "", "/app/team");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Copy the invitation link, or say how to copy it by hand. */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Invitation link copied.");
    } catch {
      setNotice("Select and copy the link above.");
    }
  }

  /** Leaving or removing someone: ask first. */
  function ask(next: TeamConfirm) {
    setError("");
    setNotice("");
    setConfirming(next);
  }

  function cancelAsk() {
    setConfirming(null);
  }

  /** The yes: do what was asked. */
  async function confirmAsk() {
    const asked = confirming;
    if (!asked) return;
    setConfirming(null);
    if (asked.action === "leave") await act("leave");
    else await act("remove", { user_id: asked.userId });
  }

  return {
    code,
    setCode,
    codeSent,
    data,
    error,
    busy,
    link,
    notice,
    invite,
    load,
    act,
    copyLink,
    confirming,
    ask,
    cancelAsk,
    confirmAsk,
  };
}

export type TeamState = ReturnType<typeof useTeam>;
