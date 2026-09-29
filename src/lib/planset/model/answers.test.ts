import { describe, expect, it } from "vitest";
import { sanitizeAnswers } from "./answers";

describe("sanitizeAnswers", () => {
  it("keeps well-formed answers", () => {
    expect(sanitizeAnswers({ "flag:stud-height": 2400, "set:pitch_deg": 25, "set:opening:W01:width_mm": 715, building: "WHAREKAI", "flag:renovation": true })).toEqual({
      "flag:stud-height": 2400,
      "set:pitch_deg": 25,
      "set:opening:W01:width_mm": 715,
      building: "WHAREKAI",
      "flag:renovation": true,
    });
  });
  it("refuses unknown keys, objects and huge values", () => {
    expect(sanitizeAnswers(JSON.parse('{"__proto__": 1}'))).toBeNull();
    expect(sanitizeAnswers({ "set:anything else": 1 })).toBeNull();
    expect(sanitizeAnswers({ "set:stud_mm": { a: 1 } })).toBeNull();
    expect(sanitizeAnswers({ "set:stud_mm": 1e12 })).toBeNull();
    expect(sanitizeAnswers({ "flag:x": "y".repeat(201) })).toBeNull();
    expect(sanitizeAnswers([1, 2])).toBeNull();
  });
});
