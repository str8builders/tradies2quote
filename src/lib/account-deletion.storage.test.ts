import { describe, expect, it } from "vitest";
import { listStoragePathsRecursive, storagePurgeTargets, type StorageLister } from "./account-deletion";
import { QUOTE_VIDEO_BUCKET, quoteVideoPaths } from "./quote-video/constants";

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

describe("storagePurgeTargets", () => {
  const USER = "0f7f4f6e-1111-4222-8333-944444444444";
  const QUOTE = "5d0a1c2e-5555-4666-8777-988888888888";

  it("purges the user's quote videos and posters by user-id prefix", () => {
    expect(storagePurgeTargets(USER, [QUOTE])).toContainEqual({ bucket: QUOTE_VIDEO_BUCKET, prefixes: [USER] });
    // The worker writes every file under that prefix.
    const paths = quoteVideoPaths(USER, QUOTE, 7);
    expect(paths.video.startsWith(`${USER}/`)).toBe(true);
    expect(paths.poster.startsWith(`${USER}/`)).toBe(true);
  });

  it("keeps every other bucket in the purge", () => {
    expect(storagePurgeTargets(USER, [QUOTE])).toEqual([
      { bucket: "profile-avatars", prefixes: [USER] },
      { bucket: "business-logos", prefixes: [USER] },
      { bucket: "quote-pdfs", prefixes: [USER] },
      { bucket: "quote-attachments", prefixes: [USER] },
      { bucket: "plan-uploads", prefixes: [USER] },
      { bucket: "quote-videos", prefixes: [USER] },
      { bucket: "signatures", prefixes: [QUOTE] },
    ]);
  });

  it("finds nested quote video files under the user prefix", async () => {
    const bucket = fakeBucket({
      [USER]: [{ name: QUOTE, id: null }],
      [`${USER}/${QUOTE}`]: [
        { name: "v2.mp4", id: "a" },
        { name: "v2.jpg", id: "b" },
      ],
    });
    expect((await listStoragePathsRecursive(bucket, USER)).sort()).toEqual([
      `${USER}/${QUOTE}/v2.jpg`,
      `${USER}/${QUOTE}/v2.mp4`,
    ]);
  });
});
