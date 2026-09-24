import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown, admin: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { GET } from "./route";

const OWNER = "0f7f4f6e-1111-4222-8333-944444444444";
const QUOTE_ID = "5d0a1c2e-5555-4666-8777-988888888888";
let user: { id: string } | null;
let videoRow: Record<string, unknown> | null;
let download: ReturnType<typeof vi.fn>;

beforeEach(() => {
  user = { id: OWNER };
  videoRow = { quote_version: 2, status: "ready", storage_path: `${OWNER}/${QUOTE_ID}/v2.mp4`, poster_path: `${OWNER}/${QUOTE_ID}/v2.jpg` };
  const db = fakeSupabase((op: FakeOp) => {
    if (op.table === "quotes") return { data: { id: QUOTE_ID, version: 2, created_at: "2026-09-20T00:00:00Z" } };
    if (op.table === "quote_videos") return { data: videoRow };
    return {};
  });
  state.client = { auth: { getUser: async () => ({ data: { user } }) }, from: db.from };
  download = vi.fn(async () => ({ data: new Blob([new Uint8Array([0, 0, 0, 24])], { type: "video/mp4" }), error: null }));
  state.admin = { storage: { from: () => ({ download }) } };
});

const call = (id: string) => GET({} as never, { params: Promise.resolve({ id }) });

describe("GET /api/quotes/[id]/video", () => {
  it("serves the owner's current video as an MP4 download", async () => {
    const res = await call(QUOTE_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Q-2026-5D0A-video.mp4"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0, 0, 0, 24]));
    expect(download).toHaveBeenCalledWith(`${OWNER}/${QUOTE_ID}/v2.mp4`);
  });

  it("refuses a signed-out visitor and a malformed id", async () => {
    expect((await call("not-a-uuid")).status).toBe(404);
    user = null;
    expect((await call(QUOTE_ID)).status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });

  it("serves nothing for a video of an older version", async () => {
    videoRow = { ...videoRow, quote_version: 1 };
    expect((await call(QUOTE_ID)).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
});
