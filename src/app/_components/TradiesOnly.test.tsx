// The site-wide wallpaper and install button: not on pages that draw their
// own world (the 3D homepage, T2QCAL), still on everything else.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { TradiesOnly } from "./TradiesOnly";

const shown = (pathname: string) => {
  nav.pathname = pathname;
  return renderToStaticMarkup(
    <TradiesOnly>
      <i>wallpaper</i>
    </TradiesOnly>,
  ).includes("wallpaper");
};

describe("TradiesOnly", () => {
  it("the 3D homepage, its old preview address and T2QCAL draw their own world", () => {
    for (const path of ["/", "/site-preview", "/t2qcal", "/t2qcal/deck"]) expect(shown(path), path).toBe(false);
  });

  it("everything else keeps it, the previous homepage at /classic included", () => {
    for (const path of ["/classic", "/login", "/help", "/app", "/calculator"]) expect(shown(path), path).toBe(true);
  });
});
