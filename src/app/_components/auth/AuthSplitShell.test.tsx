// Inside the iOS app the sign-in pages have no way out to the website,
// whose homepage shows plans and prices (App Store 3.1.3(f)).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthSplitShell } from "./AuthSplitShell";

const html = (native?: boolean) =>
  renderToStaticMarkup(<AuthSplitShell native={native} visual={<p>Visual</p>} form={<p>Form</p>} />);

describe("AuthSplitShell", () => {
  it("on the web: back to the website, logos link home", () => {
    const out = html();
    expect(out).toContain("Back to website");
    expect(out.match(/href="\/"/g)).toHaveLength(3);
  });

  it("in the iOS app: no Back to website and no links to the homepage", () => {
    const out = html(true);
    expect(out).not.toContain("Back to website");
    expect(out).not.toMatch(/href="\/"/);
    expect(out).toContain("Form");
    expect(out).toContain("studio-auth-mobile-logo");
  });
});
