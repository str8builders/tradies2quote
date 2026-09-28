-- Audit 2026-09-28 — limit what the private plan-uploads bucket accepts.
--
-- Signed-in users upload drawings straight to plan-uploads (their own
-- "{uid}/" folder), and the bucket had no file type or size limit, so any
-- account could store arbitrary files up to the global cap. Match the plan
-- reader (src/lib/planreader/storage.ts): PDF, PNG, JPEG or WebP, 25 MB. The
-- storage API enforces these for every role, including the service role that
-- writes the rendered page PNGs.
--
-- Idempotent: safe to re-run. The bucket held no objects on 28 Sep 2026.
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
where id = 'plan-uploads';
