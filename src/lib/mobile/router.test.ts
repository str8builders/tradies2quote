import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const saves = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "10101010-1010-4010-8010-101010101010", email: "fixture@example.invalid", created_at: "2026-09-21" } }, error: null }) } }) }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/app/app/quotes/preview/[id]/actions", async importOriginal => ({ ...await importOriginal<object>(), saveQuoteChanges: saves.save }));
import { dispatchMobile } from "./router";

const id = "30303030-3030-4030-8030-303030303030";
const draft = { currency: "NZD", markup_pct: 20, tax_rate: 15, line_items: [{ type: "material", description: "Boards", unit: "each", quantity: 1, unit_price: 10 }] };
function request(data: unknown) { return new NextRequest(`https://tradies2quote.com/api/mobile/v1/quotes/${id}/save`, { method: "POST", headers: { Authorization: "Bearer fixture" }, body: JSON.stringify({ quote_data: data, expectedRevision: id }) }); }
describe("mobile mutation response boundaries", () => {
  it("returns validation errors as JSON even when validation occurs inside an async action", async () => {
    saves.save.mockClear();
    const invalid = { ...draft, line_items: [{ ...draft.line_items[0], quantity: -1 }] };
    const response = await dispatchMobile(request(invalid), ["quotes", id, "save"]);
    expect(response.status).toBe(400); expect((await response.json()).error).toBe("request_failed"); expect(saves.save).not.toHaveBeenCalled();
  });
  it("maps permanent database edit conflicts to 409", async () => {
    saves.save.mockResolvedValueOnce({ error: "Refresh and compare your draft", code: "PT409" });
    const response = await dispatchMobile(request(draft), ["quotes", id, "save"]);
    expect(response.status).toBe(409); expect((await response.json()).code).toBe("PT409");
  });
  it("turns a rejected action into a bounded service error", async () => {
    saves.save.mockRejectedValueOnce(new Error("private database detail"));
    const response = await dispatchMobile(request(draft), ["quotes", id, "save"]);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private database detail");
  });
});
