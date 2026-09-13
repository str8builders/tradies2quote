"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated and bearer routes must not use the shared image optimiser. */
import { useCallback, useEffect, useState } from "react";
import { Camera, Trash } from "@phosphor-icons/react";
type Photo = { id: string; name: string };
export function QuotePhotos({ quoteId, token }: { quoteId?: string; token?: string }) {
  const endpoint = token ? `/api/quote/${encodeURIComponent(token)}/photos` : `/api/quotes/${quoteId}/photos`;
  const [photos, setPhotos] = useState<Photo[]>([]); const [canEdit, setCanEdit] = useState(false);
  const [enabled, setEnabled] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(endpoint, { signal }); const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Photos could not be loaded.");
    setPhotos(data.photos); setCanEdit(data.canEdit === true); setEnabled(data.enabled === true);
  }, [endpoint]);
  // Refresh state follows an asynchronous API response; this is external data synchronisation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch((e) => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [load]);
  async function upload(file: File) {
    setBusy(true); setError("");
    try { const body = new FormData(); body.set("photo", file); const res = await fetch(endpoint, { method: "POST", body }); const data = await res.json(); if (!res.ok) throw new Error(data.error); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Photo could not be saved."); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError("");
    try { const res = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Photo could not be removed."); } finally { setBusy(false); }
  }
  if (token && !photos.length && !error) return null;
  return <section className="t2q-card-pro p-5 sm:p-6" aria-label="Quote photos">
    <div className="flex items-center gap-2"><Camera size={20} className="text-brand" /><h2 className="text-lg font-semibold">Job photos</h2></div>
    {!token && <p className="mt-2 text-sm text-ink-300">{enabled ? "Attach up to 8 photos before sending. Clients can view them on the quote link. Photos are locked once sent." : photos.length > 0 ? "Photos the client sent with their request. Adding your own photos is included with Crew and Builder." : "Photo attachments are included with Crew and Builder."}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo) => <figure key={photo.id} className="min-w-0 overflow-hidden rounded-xl border border-ink-700">
      <a href={`${endpoint}?photo=${photo.id}`} target="_blank" rel="noreferrer"><img src={`${endpoint}?photo=${photo.id}`} alt={photo.name} loading="lazy" className="aspect-[4/3] w-full object-cover" /></a>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-300"><span className="truncate">{photo.name}</span>{canEdit && <button type="button" aria-label={`Remove ${photo.name}`} disabled={busy} onClick={() => remove(photo.id)} className="flex h-11 w-11 shrink-0 items-center justify-center"><Trash size={18} /></button>}</figcaption>
    </figure>)}</div>
    {canEdit && photos.length < 8 && <label className={`t2q-btn-secondary-pro mt-4 inline-flex min-h-11 cursor-pointer items-center px-4 ${busy ? "pointer-events-none opacity-50" : ""}`}>{busy ? "Saving photo…" : "Add a photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} /></label>}
  </section>;
}
