import { describe, expect, it } from "vitest";
import { normalisePhone, samePhone } from "./phone";

describe("phone matching", () => {
  it("folds NZ formats onto one shape", () => {
    expect(normalisePhone("021 555 1234")).toBe("0215551234");
    expect(normalisePhone("+64 21 555 1234")).toBe("0215551234");
    expect(normalisePhone("0064215551234")).toBe("0215551234");
    expect(normalisePhone("(021) 5551234")).toBe("0215551234");
  });
  it("matches the same client across formats and rejects short or different numbers", () => {
    expect(samePhone("021 555 1234", "+64211555 1234".replace("1555", "555"))).toBe(true);
    expect(samePhone("021 555 1234", "+64 21 555 1234")).toBe(true);
    expect(samePhone("021 555 1234", "021 555 1235")).toBe(false);
    expect(samePhone("123", "123")).toBe(false);
    expect(samePhone(null, "021 555 1234")).toBe(false);
  });
});
