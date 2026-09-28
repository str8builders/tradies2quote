import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "t1", business_name: "Acme Builders", logo_url: null },
          }),
        }),
      }),
    }),
  }),
}));

import RequestQuotePage from "./page";

// The old copy said "Your details go only to {business}" — wrong, since the
// job description is sent to an AI service (for follow-up questions and a
// draft quote) before the form is even submitted, and there was no link to
// the privacy policy. The fix shows an accurate notice ABOVE the form, so
// visitors read it before they type.
describe("public request page — privacy notice", () => {
  it("says who gets it and that AI helps, with a privacy link, before the form", async () => {
    const el = await RequestQuotePage({ params: Promise.resolve({ slug: "acme-builders" }) });
    const html = renderToStaticMarkup(el);

    const noticeAt = html.indexOf("AI reads what you write");
    const formAt = html.indexOf('data-testid="request-description"');
    expect(noticeAt).toBeGreaterThan(0);
    expect(formAt).toBeGreaterThan(0);
    expect(noticeAt).toBeLessThan(formAt);

    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain("Your details go only to");
  });
});
