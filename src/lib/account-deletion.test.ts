import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ adminClient: vi.fn() }));
vi.mock("@/lib/stripe-client", () => ({ isStripeConfigured: () => false, stripeClient: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
import { purgeStoragePrefix } from "./account-deletion";
type Storage = Parameters<typeof purgeStoragePrefix>[0];
describe("personal file purge", () => {
  it("removes files beyond the first page and inside nested folders without skipping", async () => {
    const root = [...Array.from({ length: 204 }, (_, i) => ({ id: `id-${i}`, name: `file-${String(i).padStart(3, "0")}` })), { id: null, name: "nested" }];
    const files: Record<string, typeof root> = { account: root, "account/nested": [{ id: "private", name: "drawing.pdf" }] };
    const removed: string[] = [];
    const storage = {
      list: vi.fn(async (prefix: string, { offset, limit }: { offset: number; limit: number }) => ({ data: files[prefix].slice(offset, offset + limit), error: null })),
      remove: vi.fn(async (paths: string[]) => { removed.push(...paths); return { error: null }; }),
    };
    await purgeStoragePrefix(storage as unknown as Storage, "account");
    expect(new Set(removed).size).toBe(205);
    expect(removed).toContain("account/nested/drawing.pdf");
    expect(removed.every(path => path.startsWith("account/"))).toBe(true);
    expect(storage.remove.mock.calls.every(([paths]) => paths.length <= 100)).toBe(true);
  });
  it("never reports success if listing or removal fails", async () => {
    const failure = new Error("network interrupted");
    await expect(purgeStoragePrefix({ list: async () => ({ error: failure }) } as unknown as Storage, "u")).rejects.toBe(failure);
    await expect(purgeStoragePrefix({ list: async () => ({ data: [{ id: "x", name: "photo.jpg" }] }), remove: async () => ({ error: failure }) } as unknown as Storage, "u")).rejects.toBe(failure);
  });
});
