-- Whole plan sets are big: the owner's new-house set is 42.9 MB. Raise the
-- private plan-uploads bucket to the storage server's own cap (50 MB,
-- FILE_SIZE_LIMIT) so a whole consented set fits. Types stay PDF/PNG/JPEG/WebP.
-- Apply as supabase_admin (storage schema). Idempotent.
update storage.buckets
set file_size_limit = 52428800
where id = 'plan-uploads';
