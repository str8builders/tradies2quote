import { describe, expect, it } from "vitest";
import {
  REQUEST_SLUG_RE,
  isValidRequestSlug,
  requestLinkFor,
  slugifyBusinessName,
  withRandomSuffix,
} from "../slug";

describe("request slugs", () => {
  it("derives a clean slug from a business name", () => {
    expect(slugifyBusinessName("STR8 Builders Ltd")).toBe("str8-builders-ltd");
    expect(slugifyBusinessName("  Sparky & Sons — Tauranga ")).toBe("sparky-and-sons-tauranga");
    expect(slugifyBusinessName("Café Māori Plumbing")).toBe("cafe-maori-plumbing");
  });

  it("returns empty for names with nothing usable", () => {
    expect(slugifyBusinessName("")).toBe("");
    expect(slugifyBusinessName("!!!")).toBe("");
    expect(slugifyBusinessName("A")).toBe("");
  });

  it("caps length and never ends on a hyphen", () => {
    const long = slugifyBusinessName("x".repeat(60) + " y");
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("-")).toBe(false);
    expect(isValidRequestSlug(long)).toBe(true);
  });

  it("validates exactly what the database check accepts", () => {
    for (const ok of ["ab", "str8-builders", "a1-b2-c3", "x".repeat(48)]) {
      expect(isValidRequestSlug(ok)).toBe(true);
    }
    for (const bad of ["a", "-ab", "ab-", "AB", "a b", "a_b", "x".repeat(49), "../x"]) {
      expect(isValidRequestSlug(bad)).toBe(false);
    }
    expect(REQUEST_SLUG_RE.source).toContain("[a-z0-9]");
  });

  it("adds a valid random suffix on clashes", () => {
    let i = 0;
    const seq = [0.1, 0.5, 0.9, 0.3];
    const slug = withRandomSuffix("str8-builders", () => seq[i++ % seq.length]);
    expect(slug).toMatch(/^str8-builders-[a-z2-9]{4}$/);
    expect(isValidRequestSlug(slug)).toBe(true);
    expect(isValidRequestSlug(withRandomSuffix("x".repeat(48)))).toBe(true);
  });

  it("builds the public link", () => {
    expect(requestLinkFor("https://tradies2quote.com/", "str8-builders")).toBe(
      "https://tradies2quote.com/r/str8-builders",
    );
  });
});
