import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestForm } from "./RequestForm";

describe("public quote request form — photo field", () => {
  const html = renderToStaticMarkup(createElement(RequestForm, { slug: "acme-builders", business: "Acme Builders" }));
  const text = html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

  it("tells the client that photos go to an AI service and are stored privately", () => {
    expect(text).toContain(
      "Photos help the tradie understand the job. They're described by an AI service (OpenAI) and stored privately for this quote.",
    );
  });

  it("accepts iPhone HEIC photos (they are converted on the device before upload)", () => {
    expect(html).toMatch(/accept="[^"]*image\/heic/);
  });
});
