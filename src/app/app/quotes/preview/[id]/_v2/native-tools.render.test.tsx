// The iPhone app's calendar and contacts buttons on the job page. They exist only inside the app: on the server
// and in a browser (where renderToStaticMarkup always lands) they draw nothing at all.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

import { contactToClientPatch } from "./contact";
import { AddToCalendarTool, AddToCalendarToolView } from "./parts/AddToCalendarTool";
import { ChooseContactButton, ChooseContactButtonView } from "./sheets/ChooseContactButton";

const job = { title: "New kwila deck", date: "2026-10-05", location: "14 Rata St", notes: "For Sam Taylor" };

describe("in a browser", () => {
  it("there is no calendar tool and no contacts button", () => {
    expect(renderToStaticMarkup(<AddToCalendarTool job={job} />)).toBe("");
    expect(renderToStaticMarkup(<ChooseContactButton onPick={() => {}} />)).toBe("");
  });
});

describe("in the iPhone app", () => {
  it("the calendar tool names the day and offers the button", () => {
    const html = renderToStaticMarkup(<AddToCalendarToolView job={job} busy={false} note={null} onAdd={() => {}} />);
    expect(html).toContain("Your phone&#x27;s calendar");
    expect(html).toContain("Mon, 5 Oct");
    expect(html).toContain('data-testid="job-add-to-calendar"');
    expect(html).toContain("Add to my calendar");
    expect(html).not.toContain("role=\"status\"");
  });

  it("says what happened: added, or why not", () => {
    const ok = renderToStaticMarkup(<AddToCalendarToolView job={job} busy={false} note={{ tone: "ok", text: "Added to your calendar." }} onAdd={() => {}} />);
    expect(ok).toContain('role="status"');
    expect(ok).toContain("Added to your calendar.");
    const bad = renderToStaticMarkup(<AddToCalendarToolView job={job} busy={false} note={{ tone: "bad", text: "The calendar didn't open. Try again." }} onAdd={() => {}} />);
    expect(bad).toContain("The calendar didn&#x27;t open. Try again.");
  });

  it("the buttons are the kit's, with a busy state", () => {
    const busy = renderToStaticMarkup(<AddToCalendarToolView job={job} busy note={null} onAdd={() => {}} />);
    expect(busy).toContain("Opening…");
    expect(renderToStaticMarkup(<ChooseContactButtonView busy={false} onChoose={() => {}} />)).toContain("Choose from my contacts");
    expect(renderToStaticMarkup(<ChooseContactButtonView busy onChoose={() => {}} />)).toContain("Opening contacts…");
  });
});

describe("contactToClientPatch", () => {
  const full = { name: "Sam Taylor", company: "Taylor Carpentry", phone: "021 555 0199", email: "sam@example.com", address: "14 Rata St, Tauranga" };

  it("fills every box the contact has", () => {
    expect(contactToClientPatch(full)).toEqual({ name: "Sam Taylor", phone: "021 555 0199", email: "sam@example.com", address: "14 Rata St, Tauranga" });
  });

  it("leaves a box alone when the contact has nothing for it", () => {
    expect(contactToClientPatch({ ...full, phone: "", email: " ", address: "" })).toEqual({ name: "Sam Taylor" });
    expect(contactToClientPatch({ name: "", company: "", phone: "", email: "", address: "" })).toEqual({});
  });

  it("a business with no personal name gives its company name", () => {
    expect(contactToClientPatch({ ...full, name: "", company: " Taylor Carpentry " }).name).toBe("Taylor Carpentry");
  });
});
