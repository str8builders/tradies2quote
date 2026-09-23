import { describe, expect, it } from "vitest";
import { listStoragePathsRecursive, type StorageLister } from "./account-deletion";

function fakeBucket(tree: Record<string, Array<{ name: string; id: string | null }>>): StorageLister {
  return {
    async list(path, { limit, offset }) {
      return { data: (tree[path] ?? []).slice(offset, offset + limit), error: null };
    },
  };
}

describe("listStoragePathsRecursive", () => {
  it("descends into nested folders (client photos under user/quote/…)", async () => {
    const bucket = fakeBucket({
      u1: [{ name: "q1", id: null }, { name: "logo.png", id: "a" }],
      "u1/q1": [{ name: "photo-1.jpg", id: "b" }, { name: "sub", id: null }],
      "u1/q1/sub": [{ name: "deep.jpg", id: "c" }],
    });
    expect((await listStoragePathsRecursive(bucket, "u1")).sort()).toEqual(
      ["u1/logo.png", "u1/q1/photo-1.jpg", "u1/q1/sub/deep.jpg"].sort(),
    );
  });

  it("pages past 100 entries", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ name: `f${i}.pdf`, id: String(i) }));
    const bucket = fakeBucket({ u1: many });
    expect(await listStoragePathsRecursive(bucket, "u1")).toHaveLength(250);
  });

  it("throws when the storage API errors, so the caller can report it", async () => {
    const bucket: StorageLister = { async list() { return { data: null, error: new Error("boom") }; } };
    await expect(listStoragePathsRecursive(bucket, "u1")).rejects.toThrow("boom");
  });
});
