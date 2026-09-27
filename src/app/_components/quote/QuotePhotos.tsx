"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated and bearer routes must not use the shared image optimiser. */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Camera, SpinnerGap, Trash } from "@phosphor-icons/react";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import { inIPhoneApp } from "@/lib/trial-ended";
type Photo = { id: string; name: string };
/**
 * Where the photo list is read, and where (if anywhere) it can be changed.
 * The public quote-link route `/api/quote/[token]/photos` is GET-only;
 * uploads and removals exist only on the owner's `/api/quotes/[id]/photos`.
 */
export function quotePhotoEndpoints({ quoteId, token }: { quoteId?: string; token?: string }): { list: string; manage: string | null } {
  if (token) return { list: `/api/quote/${encodeURIComponent(token)}/photos`, manage: null };
  const owner = `/api/quotes/${encodeURIComponent(quoteId ?? "")}/photos`;
  return { list: owner, manage: owner };
}
const noSubscribe = () => () => {};
/**
 * The line under "Job photos". In the iPhone app plan names are never shown
 * (App Store 3.1.3(f)). The new-look job page opens this in the More tools
 * sheet, drawn on the phone, so the app's words are there from the start.
 */
export function photosNote({ enabled, fromClient, inApp }: { enabled: boolean; fromClient: boolean; inApp: boolean }): string {
  if (enabled) return "Attach up to 8 photos before sending. Clients can view them on the quote link. Photos are locked once sent.";
  if (inApp) return fromClient ? "Photos the client sent with their request." : "Adding photos to quotes isn’t switched on for this account.";
  return fromClient ? "Photos the client sent with their request. Adding your own photos is included with Crew and Builder." : "Photo attachments are included with Crew and Builder.";
}
/** `look="new"`: the job page's More tools, drawn with the kit and ui- tokens (QuotePhotosV2View). */
export function QuotePhotos({ quoteId, token, look = "classic" }: { quoteId?: string; token?: string; look?: "classic" | "new" }) {
  const inApp = useSyncExternalStore(noSubscribe, inIPhoneApp, () => false);
  const { list: endpoint, manage } = quotePhotoEndpoints({ quoteId, token });
  const [photos, setPhotos] = useState<Photo[]>([]); const [canEdit, setCanEdit] = useState(false);
  const [enabled, setEnabled] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(endpoint, { signal }); const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The public link answers 404 (no body) once a quote stops being live: just show no photos.
      if (token && res.status === 404) { setPhotos([]); return; }
      throw new Error(data.error || "Photos could not be loaded.");
    }
    setPhotos(Array.isArray(data.photos) ? data.photos : []); setCanEdit(manage !== null && data.canEdit === true); setEnabled(data.enabled === true);
  }, [endpoint, manage, token]);
  // Refresh state follows an asynchronous API response; this is external data synchronisation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch((e) => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [load]);
  async function upload(file: File) {
    if (!manage) return; // the public link is read-only
    setBusy(true); setError("");
    try { const body = new FormData(); body.set("photo", file); const res = await fetch(manage, { method: "POST", body }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Photo could not be saved."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Photo could not be saved."); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!manage) return; // the public link is read-only
    setBusy(true); setError("");
    try { const res = await fetch(manage, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Photo could not be removed."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Photo could not be removed."); } finally { setBusy(false); }
  }
  if (token && !photos.length && !error) return null;
  if (look === "new") return <QuotePhotosV2View photos={photos} endpoint={endpoint} note={token ? null : photosNote({ enabled, fromClient: photos.length > 0, inApp })} canEdit={canEdit} busy={busy} error={error} onUpload={(file) => void upload(file)} onRemove={(id) => void remove(id)} />;
  return <section className="t2q-card-pro p-5 sm:p-6" aria-label="Quote photos">
    <div className="flex items-center gap-2"><Camera size={20} className="text-brand" /><h2 className="text-lg font-semibold">Job photos</h2></div>
    {!token && <p className="mt-2 text-sm text-ink-300">{photosNote({ enabled, fromClient: photos.length > 0, inApp })}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo) => <figure key={photo.id} className="min-w-0 overflow-hidden rounded-xl border border-ink-700">
      <a href={`${endpoint}?photo=${photo.id}`} target="_blank" rel="noreferrer"><img src={`${endpoint}?photo=${photo.id}`} alt={photo.name} loading="lazy" className="aspect-[4/3] w-full object-cover" /></a>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-300"><span className="truncate">{photo.name}</span>{canEdit && <button type="button" aria-label={`Remove ${photo.name}`} disabled={busy} onClick={() => remove(photo.id)} className="flex h-11 w-11 shrink-0 items-center justify-center"><Trash size={18} /></button>}</figcaption>
    </figure>)}</div>
    {canEdit && photos.length < 8 && <label className={`t2q-btn-secondary-pro mt-4 inline-flex min-h-11 cursor-pointer items-center px-4 ${busy ? "pointer-events-none opacity-50" : ""}`}>{busy ? "Saving photo…" : "Add a photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} /></label>}
  </section>;
}
/**
 * The new look's photos, for a given state (no fetching here). It sits in a
 * tool already titled "Photos", so it has no heading or card of its own: the
 * note, the photos two across with a 48 px Remove on each, and "Add a photo"
 * as the kit's secondary button.
 */
export function QuotePhotosV2View({ photos, endpoint, note, canEdit, busy, error, onUpload, onRemove }: {
  photos: Photo[]; endpoint: string; note: string | null; canEdit: boolean; busy: boolean; error: string;
  onUpload: (file: File) => void; onRemove: (id: string) => void;
}) {
  return <section className="space-y-3" aria-label="Quote photos">
    {note && <p className="text-ui-sm text-ui-muted">{note}</p>}
    {error && <div role="alert"><Callout tone="bad" title={error} /></div>}
    {photos.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo) => <figure key={photo.id} className="min-w-0 overflow-hidden rounded-ui-md border border-ui-line bg-ui-surface-2">
      <a href={`${endpoint}?photo=${photo.id}`} target="_blank" rel="noreferrer" className="ui-focus-ring block"><img src={`${endpoint}?photo=${photo.id}`} alt={photo.name} loading="lazy" className="aspect-[4/3] w-full object-cover" /></a>
      <figcaption className="flex items-center justify-between gap-1 py-1 pl-3 text-ui-sm text-ui-muted"><span className="truncate">{photo.name}</span>{canEdit && <IconButton label={`Remove ${photo.name}`} icon={<Trash weight="bold" />} disabled={busy} onClick={() => onRemove(photo.id)} />}</figcaption>
    </figure>)}</div>}
    {canEdit && photos.length < 8 && <label className={cx(buttonClasses({ variant: "secondary", fullWidth: true, disabled: busy }), "ui-focus-within-ring", busy ? "pointer-events-none" : "cursor-pointer")}>
      {busy ? <SpinnerGap aria-hidden="true" weight="bold" className="shrink-0 animate-spin text-[1.15em] motion-reduce:animate-spin-calm" /> : <Camera aria-hidden="true" weight="bold" className="shrink-0 text-[1.15em]" />}
      {busy ? "Saving photo…" : "Add a photo"}
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onUpload(file); }} />
    </label>}
  </section>;
}
