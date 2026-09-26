// The privacy policy and terms are easy to find inside the app (App Store
// 5.1.1(i)): rows in the photo menu's Help group, and on /app/more.

import { describe, expect, it } from "vitest";
import { MORE_ICON } from "../_components/more-icons";
import { accountMenuSections, MORE_TONE, moreMenu } from "./menu";

describe("privacy policy and terms in the menus", () => {
  it("the photo menu's Help group ends with Privacy policy and Terms", () => {
    const help = accountMenuSections().find((section) => section.id === "help");
    expect(help?.items.slice(-2).map((item) => [item.label, item.href])).toEqual([
      ["Privacy policy", "/privacy"],
      ["Terms", "/terms"],
    ]);
  });

  it("the More page lists them too, each with an icon and a tone", () => {
    const rows = moreMenu({ isOwner: false }).groups.flatMap((group) => group.items);
    for (const id of ["privacy", "terms"] as const) {
      const row = rows.find((item) => item.id === id);
      expect(row?.href).toBe(`/${id}`);
      expect(MORE_ICON[id]).toBeTruthy();
      expect(MORE_TONE[id]).toBe("neutral");
    }
  });
});
