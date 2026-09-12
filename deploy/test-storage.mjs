import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStorage, REQUIRED_BUCKETS } from './check-storage.mjs';

test('read-only check reports absent private document storage without writes', async () => {
  await assert.rejects(checkStorage({ listBuckets: async () => ({ data: [] }), createBucket: () => assert.fail('write') }), /missing or public/);
});
test('apply creates missing buckets privately, verifies them, and is idempotent', async () => {
  const buckets = [];
  let writes = 0;
  const storage = {
    listBuckets: async () => ({ data: buckets }),
    createBucket: async (id, options) => { assert.equal(options.public, false); buckets.push({ id, ...options }); writes++; return {}; },
    getBucket: async id => ({ data: buckets.find(bucket => bucket.id === id) }),
  };
  assert.equal((await checkStorage(storage, { apply: true })).ok, true);
  await checkStorage(storage, { apply: true });
  assert.equal(writes, REQUIRED_BUCKETS.length);
});
test('does not silently reuse a public bucket or change its permissions', async () => {
  await assert.rejects(checkStorage({ listBuckets: async () => ({ data: [{ id: 'quote-pdfs', public: true }] }) }, { apply: true }), /missing or public/);
});
test('creation failures prevent a false success', async () => {
  await assert.rejects(checkStorage({ listBuckets: async () => ({ data: [] }), createBucket: async () => ({ error: {} }) }, { apply: true }), /Could not create/);
});
