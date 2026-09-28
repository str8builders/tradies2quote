import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS } from "@/lib/plans";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => h.native }));

import SupportPage from "./page";

// The homepage sells Solo now ($49/month) — "Paid plans (when they launch)"
// wrongly implied nothing was purchasable yet.
describe("support page — billing wording matches reality (Solo is live)", () => {
  it("says paid plans are available now, at the real Solo price", async () => {
    h.native = false;
    const html = renderToStaticMarkup(await SupportPage());
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain(`$${PLANS.solo.price}/month`);
    expect(text).not.toMatch(/paid plans \(when they launch\)/i);
  });

  it("still hides all billing wording inside the iPhone app (3.1.3(f))", async () => {
    h.native = true;
    const html = renderToStaticMarkup(await SupportPage());
    expect(html).not.toContain("Trial, plans & billing");
    expect(html).not.toContain(`$${PLANS.solo.price}/month`);
  });
});
