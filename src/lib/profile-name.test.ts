import { describe, expect, it } from "vitest";
import { FIRST_NAME_MAX, avatarLetter, greetingName, normalizeFirstName } from "./profile-name";

describe("normalizeFirstName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeFirstName("  Challis  ")).toEqual({ ok: true, value: "Challis" });
    expect(normalizeFirstName("Mary   Jane")).toEqual({ ok: true, value: "Mary Jane" });
  });
  it("treats blank, null and undefined as no name", () => {
    expect(normalizeFirstName("")).toEqual({ ok: true, value: null });
    expect(normalizeFirstName("   ")).toEqual({ ok: true, value: null });
    expect(normalizeFirstName(null)).toEqual({ ok: true, value: null });
    expect(normalizeFirstName(undefined)).toEqual({ ok: true, value: null });
  });
  it("drops control and invisible format characters", () => {
    expect(normalizeFirstName("Chal\u0000lis​")).toEqual({ ok: true, value: "Challis" });
  });
  it("keeps macrons and other letters", () => {
    expect(normalizeFirstName("Tāne")).toEqual({ ok: true, value: "Tāne" });
  });
  it("refuses names over the limit and non-strings", () => {
    expect(normalizeFirstName("a".repeat(FIRST_NAME_MAX))).toEqual({ ok: true, value: "a".repeat(FIRST_NAME_MAX) });
    expect(normalizeFirstName("a".repeat(FIRST_NAME_MAX + 1)).ok).toBe(false);
    expect(normalizeFirstName(42).ok).toBe(false);
    expect(normalizeFirstName({}).ok).toBe(false);
  });
});

describe("greetingName", () => {
  it("prefers the first name", () => {
    expect(greetingName({ firstName: "Challis", businessName: "STR8 Builders" })).toBe("Challis");
  });
  it("falls back to the whole business name", () => {
    expect(greetingName({ firstName: null, businessName: "STR8 Builders" })).toBe("STR8 Builders");
    expect(greetingName({ firstName: "  ", businessName: " STR8  Builders " })).toBe("STR8 Builders");
  });
  it("is null when there's neither", () => {
    expect(greetingName({ firstName: null, businessName: null })).toBeNull();
    expect(greetingName({ firstName: undefined, businessName: "" })).toBeNull();
  });
});

describe("avatarLetter", () => {
  it("uses the name, then the email", () => {
    expect(avatarLetter("challis", "x@y.nz")).toBe("C");
    expect(avatarLetter(null, "str8@gmail.com")).toBe("S");
    expect(avatarLetter("  ", " ")).toBe("?");
    expect(avatarLetter("Ōtautahi", null)).toBe("Ō");
  });
});
