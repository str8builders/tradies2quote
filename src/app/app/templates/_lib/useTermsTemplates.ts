"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

export type Template = { id?: string; title: string; body: string };

export const EMPTY_TEMPLATE: Template = { title: "", body: "" };

/**
 * Terms templates: load them from /api/terms-templates (with whether they
 * are switched on and whether you may edit), and save one there. Shared by
 * the old look's <TemplatesManager> and the new look's cards.
 */
export function useTermsTemplates() {
  const [items, setItems] = useState<Template[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [edit, setEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<Template>(EMPTY_TEMPLATE);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/terms-templates");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setItems(d.templates);
      setEnabled(d.enabled);
      setEdit(d.canEdit);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    }
  }, []);

  // Refresh state follows an asynchronous API response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/terms-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setForm(EMPTY_TEMPLATE);
      setNotice("Template saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return { items, enabled, edit, loaded, form, setForm, error, notice, busy, load, save };
}

export type TermsTemplatesState = ReturnType<typeof useTermsTemplates>;
