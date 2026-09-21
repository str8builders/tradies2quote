import { expect, it } from "vitest";
import { isPublicSupabaseKey } from "./public-configuration";
const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
it("allows only anonymous or publishable keys in mobile configuration", () => {
  expect(isPublicSupabaseKey(jwt("anon"))).toBe(true);
  expect(isPublicSupabaseKey("sb_publishable_example")).toBe(true);
  for (const key of [jwt("service_role"), jwt("authenticated"), "sb_secret_example", "", "x.invalid.y"]) expect(isPublicSupabaseKey(key)).toBe(false);
});
