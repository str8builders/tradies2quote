import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/plansets: owner-only while the reader is proven (404 for everyone
 * else), PDFs only, 50 MB cap, and the upload goes to the caller's own
 * {uid}/sets/{id}/ folder — never a path the client chose.
 */
const h = vi.hoisted(() => ({
  allowed: true,
  user: { id: "u-1", email: "owner@example.invalid", created_at: "2026-09-01T00:00:00Z" } as { id: string; email: string; created_at: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  signed: [] as string[],
}));

vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/planreader/flag", () => ({ planReaderAllowed: () => h.allowed }));
vi.mock("@/lib/ai-consent", () => ({ aiConsentGate: async () => null }));
vi.mock("@/lib/subscription", () => ({ getSubscriptionStatus: async () => ({ state: "trialing" }), canWrite: () => true }));
vi.mock("@/lib/rate-limit", () => ({ consumeDailyQuota: () => ({ ok: true }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));
vi.mock("@/lib/planset/job", () => ({ runPlanSetJob: vi.fn(async () => "done"), PLAN_SET_LEASE_MS: 180_000 }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        h.inserts.push(row);
        return { error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          h.signed.push(path);
          return { data: { path, token: "tok" }, error: null };
        },
      }),
    },
  }),
}));

import { POST } from "./route";

const req = (body: unknown) => new NextRequest("http://x/api/plansets", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  h.allowed = true;
  h.user = { id: "u-1", email: "owner@example.invalid", created_at: "2026-09-01T00:00:00Z" };
  h.inserts = [];
  h.signed = [];
});

describe("POST /api/plansets", () => {
  it("401 when signed out, 404 for anyone the flag doesn't allow", async () => {
    h.user = null;
    expect((await POST(req({}))).status).toBe(401);
    h.user = { id: "u-2", email: "someone@example.invalid", created_at: "2026-09-01T00:00:00Z" };
    h.allowed = false;
    expect((await POST(req({ original_filename: "a.pdf", byte_size: 10 }))).status).toBe(404);
    expect(h.inserts).toEqual([]);
  });

  it("takes PDFs up to 50 MB only", async () => {
    expect((await POST(req({ original_filename: "plans.docx", byte_size: 10 }))).status).toBe(400);
    expect((await POST(req({ original_filename: "plans.pdf", byte_size: 0 }))).status).toBe(400);
    expect((await POST(req({ original_filename: "plans.pdf", byte_size: 51 * 1024 * 1024 }))).status).toBe(413);
  });

  it("creates the set and a signed upload into the caller's own folder", async () => {
    const res = await POST(req({ original_filename: "Approved Plans.pdf", byte_size: 42_900_000, storage_path: "someone-else/x.pdf" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; upload: { path: string; token: string } };
    expect(h.inserts[0]).toMatchObject({ user_id: "u-1", original_filename: "Approved Plans.pdf", byte_size: 42_900_000 });
    expect(h.inserts[0].storage_path).toBe(`u-1/sets/${body.id}/original.pdf`);
    expect(h.signed).toEqual([`u-1/sets/${body.id}/original.pdf`]);
    expect(body.upload.token).toBe("tok");
  });
});
