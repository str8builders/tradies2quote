// /app/materials (current look) inside the iPhone app: the Android "share
// into the app" tip means nothing there, so it isn't shown.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ native: false }));

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => false }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("./_components/ScanBarcodeButton", () => ({ ScanBarcodeButton: () => null }));

import MaterialsPage from "./page";

/** The share-tip component the page renders (an async server component). */
async function shareTip(): Promise<string> {
  const tree = await MaterialsPage();
  let tip: ReactElement | null = null;
  const visit = (value: unknown) => {
    if (tip || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (!("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (typeof element.type === "function" && element.type.name === "ShareIntoAppNote") tip = element;
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(tree);
  if (!tip) throw new Error("share tip not found");
  const render = (tip as ReactElement).type as () => Promise<ReactElement>;
  return renderToStaticMarkup(await render());
}

beforeEach(() => {
  env.native = false;
});

describe("/app/materials share tip", () => {
  it("on the web keeps the Android tip", async () => {
    expect(await shareTip()).toContain("Android PWA users");
  });

  it("in the iPhone app leaves the Android tip out", async () => {
    env.native = true;
    const html = await shareTip();
    expect(html).not.toContain("Android");
    expect(html).toContain("Paste the product link");
  });
});
