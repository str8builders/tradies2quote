// The request-QR sticker sheet (/print/request-sticker): layouts and the
// iPhone app, with the sign-in and profile read stubbed.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestPrint } from "../_lib/request-print";

const state = vi.hoisted(() => ({ data: null as unknown, returnTo: [] as string[] }));
vi.mock("../_lib/request-print", () => ({
  loadRequestPrint: async (returnTo: string) => {
    state.returnTo.push(returnTo);
    return state.data;
  },
}));

import { stickerCount, stickerHref, stickerSize } from "../_lib/sticker";
import RequestStickerPage from "./page";

const DATA: RequestPrint = {
  business: "Bayside Builders",
  phone: "021 000 000",
  logo: null,
  link: "https://tradies2quote.com/r/bayside-builders",
  shortLink: "tradies2quote.com/r/bayside-builders",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h1v1H0z"/></svg>',
  inApp: false,
};

beforeEach(() => {
  state.data = { ...DATA };
  state.returnTo = [];
});

async function render(size?: string): Promise<string> {
  const element = (await RequestStickerPage({ searchParams: Promise.resolve(size ? { size } : {}) })) as ReactElement;
  return renderToStaticMarkup(element);
}

const count = (html: string, fragment: string) => html.split(fragment).length - 1;

describe("sticker sizes", () => {
  it("one big sticker unless four small ones are asked for", () => {
    expect(stickerSize(undefined)).toBe("big");
    expect(stickerSize("huge")).toBe("big");
    expect(stickerSize(["small"])).toBe("big");
    expect(stickerSize("small")).toBe("small");
    expect([stickerCount("big"), stickerCount("small")]).toEqual([1, 4]);
    expect([stickerHref("big"), stickerHref("small")]).toEqual(["/print/request-sticker", "/print/request-sticker?size=small"]);
  });
});

describe("request sticker sheet", () => {
  it("big: one sticker with the band, the code, the business and phone, and a print button", async () => {
    const out = await render();
    expect(count(out, 'data-testid="request-sticker"')).toBe(1);
    expect(out).toContain("Scan for a quote");
    expect(out).toContain("Bayside Builders");
    expect(out).toContain("021 000 000");
    expect(out).toContain('<path d="M0 0h1v1H0z"/>');
    expect(out).toContain("Print sticker");
    expect(out).toContain('data-size="big"');
    expect(state.returnTo).toEqual(["/print/request-sticker"]);
  });

  it("small: four stickers on the sheet", async () => {
    const out = await render("small");
    expect(count(out, 'data-testid="request-sticker"')).toBe(4);
    expect(out).toContain("Print stickers");
    expect(out).toMatch(/data-testid="sticker-size-small"[^>]*aria-current="true"|aria-current="true"[^>]*data-testid="sticker-size-small"/);
    expect(state.returnTo).toEqual(["/print/request-sticker?size=small"]);
  });

  it("prints true to size: millimetres in print, 100% scale, and a way back to Your QR code", async () => {
    const out = await render();
    expect(out).toContain("font-size:5mm");
    expect(out).toContain("Print at 100%");
    expect(out).toContain('href="/app/qr-code"');
  });

  it("puts the logo in the middle of the code when there is one", async () => {
    expect(await render()).not.toContain("t2q-sticker-qr-logo\"");
    state.data = { ...DATA, logo: "https://cdn.example.test/logo.png" };
    expect(await render()).toContain('src="https://cdn.example.test/logo.png"');
  });

  it("in the iPhone app (which can't print a web page): where printing works instead", async () => {
    state.data = { ...DATA, inApp: true };
    const out = await render();
    expect(out).toContain('data-testid="sticker-in-app"');
    expect(out).not.toContain('data-testid="poster-print"');
    expect(out.replace(/<[^>]*>/g, " ")).not.toMatch(/\bplans?\b|subscri|upgrade|\$/i);
  });
});
