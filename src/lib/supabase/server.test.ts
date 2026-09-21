import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ headers: vi.fn(), cookies: vi.fn(), browser: vi.fn(), token: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.browser }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.token }));
import { createClient } from "./server";
describe("request identity isolation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "session", value: "other-user" }] }); });
  it("uses the browser session when no explicit identity is supplied", async () => {
    mocks.headers.mockResolvedValue(new Headers()); await createClient();
    expect(mocks.browser).toHaveBeenCalledOnce(); expect(mocks.token).not.toHaveBeenCalled();
  });
  it.each(["Bearer user.jwt.token", "bearer user.jwt.token"])("uses only the explicit user token: %s", async authorization => {
    mocks.headers.mockResolvedValue(new Headers({ authorization })); await createClient();
    expect(mocks.cookies).not.toHaveBeenCalled(); expect(mocks.browser).not.toHaveBeenCalled();
    expect(mocks.token.mock.calls[0][2]).toMatchObject({ auth: { persistSession: false }, global: { headers: { Authorization: "Bearer user.jwt.token" } } });
  });
  it.each(["Basic abc", "Bearer", "Bearer wrong token", ""])("fails closed for malformed authorization: %s", async authorization => {
    mocks.headers.mockResolvedValue(new Headers({ authorization })); await createClient();
    expect(mocks.browser).not.toHaveBeenCalled(); expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.token.mock.calls[0][2].global.headers.Authorization).toBe("Bearer invalid");
  });
});
