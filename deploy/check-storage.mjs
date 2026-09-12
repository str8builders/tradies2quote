#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Documents are served by authenticated/token-validated app routes using the
// service role. No public buckets or client storage policies are needed.
export const REQUIRED_BUCKETS = ['quote-pdfs', 'signatures'];

export async function checkStorage(storage, { apply = false } = {}) {
  const listed = await storage.listBuckets();
  if (listed.error || !Array.isArray(listed.data)) throw new Error('Could not inspect storage buckets.');
  const results = [];
  for (const id of REQUIRED_BUCKETS) {
    let bucket = listed.data.find(item => item.id === id);
    if (!bucket && apply) {
      const created = await storage.createBucket(id, { public: false });
      if (created.error) throw new Error(`Could not create private bucket: ${id}.`);
      const verified = await storage.getBucket(id);
      if (verified.error) throw new Error(`Could not verify bucket: ${id}.`);
      bucket = verified.data;
    }
    if (bucket?.public !== false) throw new Error(`Required private bucket missing or public: ${id}.`);
    results.push({ bucket: id, private: true });
  }
  return { ok: true, buckets: results };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) {
    console.error('Usage: check-storage.mjs [--apply]');
    return 2;
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Storage credentials are missing.');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    console.log(JSON.stringify(await checkStorage(client.storage, { apply: args[0] === '--apply' })));
    return 0;
  } catch (error) {
    // Only our fixed diagnostics can reach logs; no SDK/network details.
    console.error(error instanceof Error && /^(Could not|Required private|Storage credentials)/.test(error.message)
      ? error.message : 'Storage check failed.');
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
