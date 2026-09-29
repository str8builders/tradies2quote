import { describe, expect, it } from "vitest";
import { declaredRatio } from "./finish";

describe("declaredRatio", () => {
  it("takes the one plan scale a sheet prints", () => {
    expect(declaredRatio(["1:100 @ A3"])).toBe(100);
    expect(declaredRatio(["SCALE", "Scale: 1:100", "1:100"])).toBe(100);
  });
  it("offers nothing when the sheet prints several, none, or detail scales only", () => {
    expect(declaredRatio(["1:100", "1:50"])).toBeNull();
    expect(declaredRatio(["As indicated"])).toBeNull();
    expect(declaredRatio(["1:5", "1:10"])).toBeNull();
  });
});
