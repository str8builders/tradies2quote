"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

export type SavedClient = { id: string; name: string; email: string | null; phone: string | null; address: string | null };
export type ClientFormValues = { id?: string; name: string; email: string; phone: string; address: string };

export const EMPTY_CLIENT_FORM: ClientFormValues = { name: "", email: "", phone: "", address: "" };

/** The /api/clients list holds at most this many (the old page said so too). */
export const CLIENTS_LIMIT = 1000;

/** The form for an existing client: the saved details, blanks for missing ones. */
export function clientFormFor(client: SavedClient): ClientFormValues {
  return { id: client.id, name: client.name, email: client.email ?? "", phone: client.phone ?? "", address: client.address ?? "" };
}

/** Clients whose name, email, phone or address contains the search (any case). */
export function searchClients(clients: readonly SavedClient[], search: string): SavedClient[] {
  return clients.filter((c) => [c.name, c.email, c.phone, c.address].some((v) => v?.toLowerCase().includes(search.toLowerCase())));
}

/**
 * The address book: load it from /api/clients, add or update a client with
 * a POST there, and search it on the phone. Shared by the old look's
 * <ClientsManager> and the new look's list, so both behave the same.
 */
export function useClientsBook() {
  const [clients, setClients] = useState<SavedClient[]>([]);
  const [shared, setShared] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ClientFormValues>(EMPTY_CLIENT_FORM);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/clients");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setClients(d.clients);
      setShared(d.shared);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load clients.");
    }
  }, []);

  // Refresh state follows an asynchronous API response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  /** Save the form; true when it saved (the form is then cleared and the list reloaded). */
  async function save(e: FormEvent): Promise<boolean> {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setForm(EMPTY_CLIENT_FORM);
      setNotice("Client saved. You can select this client when reviewing a quote.");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save client.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const visible = searchClients(clients, search);

  return { clients, shared, search, setSearch, form, setForm, error, setError, notice, busy, loaded, load, save, visible };
}

export type ClientsBook = ReturnType<typeof useClientsBook>;
