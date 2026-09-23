-- ===========================================================================
-- Limit what the two PUBLIC buckets accept.
--
-- business-logos and profile-avatars are public (served on the client quote
-- page and in PDFs) and had no file type or size limit, only an owner check,
-- so any signed-up account could host arbitrary public files up to the 50 MB
-- global cap. Match the server actions exactly (logo-actions.ts: JPG/PNG,
-- 8 MB; account-hub-actions.ts: JPG/PNG/WebP, 8 MB). The storage API enforces
-- these for every role, including the service role.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'business-logos';

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'profile-avatars';
