// Refusals the app shows as they come back from the server: inside the
// iPhone app they never name a plan or a subscription (App Store 3.1.3(f)).
// The website's replies are unchanged.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  ua: "",
  rpc: { data: null as unknown, error: null as { message: string } | null },
  single: { data: null as unknown, error: null as { message: string } | null },
  quote: { id: "q-1", status: "draft" },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k.toLowerCase() === "user-agent" ? h.ua : null) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "insert", "update", "order"]) chain[method] = () => chain;
    chain.single = async () => h.single;
    chain.maybeSingle = async () => ({ data: h.quote, error: null });
    return {
      auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "t@example.invalid" } } }) },
      from: () => chain,
      rpc: async () => h.rpc,
    };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));
vi.mock("@/lib/team-email", () => ({ sendTeamCode: vi.fn() }));
vi.mock("@/lib/team", () => ({ getTeamContext: async () => ({ active: false, plan: "solo", isOwner: true }) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeFixedWindow: () => ({ ok: true }) }));

import { POST as teamPost } from "./team/route";
import { POST as templatesPost } from "./terms-templates/route";
import { POST as photosPost } from "./quotes/[id]/photos/route";

const WEB_UA = "Mozilla/5.0 (iPhone) Version/18 Safari/604.1";
const APP_UA = "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell";
const MONEY = /crew|builder|\bplan\b|subscri|upgrade|checkout|billing/i;

const json = (url: string, body: unknown) =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

beforeEach(() => {
  h.rpc = { data: null, error: null };
  h.single = { data: null, error: null };
});

describe("POST /api/team: the team rules' refusals", () => {
  it("iPhone app: plan and subscription refusals in plain words", async () => {
    h.ua = APP_UA;
    h.rpc = { data: null, error: { message: "An active Crew or Builder plan is required." } };
    const res = await teamPost(json("https://tradies2quote.com/api/team", { action: "create", name: "Walker Builds" }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("Team sharing isn't switched on for this account.");

    h.rpc = { data: null, error: { message: "Your account already has a subscription. Finish or cancel it before joining a team." } };
    const joining = await errorOf(await teamPost(json("https://tradies2quote.com/api/team", { action: "leave" })));
    expect(joining).not.toMatch(MONEY);
  });

  it("website: the rules' own words, unchanged", async () => {
    h.ua = WEB_UA;
    h.rpc = { data: null, error: { message: "An active Crew or Builder plan is required." } };
    const res = await teamPost(json("https://tradies2quote.com/api/team", { action: "create", name: "Walker Builds" }));
    expect(await errorOf(res)).toBe("An active Crew or Builder plan is required.");
  });

  it("a refusal with nothing to do with plans passes through in the app", async () => {
    h.ua = APP_UA;
    h.rpc = { data: { error: "The verification code is incorrect." }, error: null };
    const res = await teamPost(json("https://tradies2quote.com/api/team", { action: "leave" }));
    expect(await errorOf(res)).toBe("The verification code is incorrect.");
  });
});

describe("POST /api/terms-templates: saving isn't allowed", () => {
  it("iPhone app: no plan named; website: as before", async () => {
    h.single = { data: null, error: { message: "new row violates row-level security policy" } };
    h.ua = APP_UA;
    const app = await templatesPost(json("https://tradies2quote.com/api/terms-templates", { title: "Standard", body: "30 days." }));
    expect(app.status).toBe(403);
    expect(await errorOf(app)).toBe("Terms templates can't be changed on this account.");
    h.ua = WEB_UA;
    const web = await templatesPost(json("https://tradies2quote.com/api/terms-templates", { title: "Standard", body: "30 days." }));
    expect(await errorOf(web)).toBe("An active Builder plan and team-owner access are required.");
  });
});

describe("POST /api/quotes/[id]/photos: attachments aren't on", () => {
  const upload = () => {
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([1, 2, 3])], "site.jpg", { type: "image/jpeg" }));
    return photosPost(new NextRequest("https://tradies2quote.com/api/quotes/q-1/photos", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "q-1" }),
    });
  };

  it("iPhone app: no plan named; website: as before", async () => {
    h.ua = APP_UA;
    const app = await upload();
    expect(app.status).toBe(403);
    expect(await errorOf(app)).toBe("Photos can't be added to this quote.");
    h.ua = WEB_UA;
    expect(await errorOf(await upload())).toBe("Add photos to a draft with an active Crew or Builder plan.");
  });
});
