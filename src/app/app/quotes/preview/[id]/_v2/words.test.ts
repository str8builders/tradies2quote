// Job names, client details, reminders and dates: the plain words the job
// page prints, all worked out without a DOM.
import { describe, expect, it } from "vitest";
import {
  clientForm,
  clientFormProblem,
  clientFromForm,
  looksLikeEmail,
  migrateLegacyContact,
  publicQuoteLink,
  reminderText,
  sameClient,
} from "./contact";
import { bookedDateKey, bookedDayLabel, invoiceDaysLate, invoiceState, isPastExpiry, localDateKey, shortDate } from "./dates";
import { clientFirstName, jobHeading, realClientName, summaryTitle } from "./job-title";
import { jobPageLook } from "./look";

describe("job name from the summary", () => {
  it("uses the first plain phrase", () => {
    expect(summaryTitle("New kwila deck at 14 Rata St. Includes steps and a handrail.")).toBe("New kwila deck at 14 Rata St");
    expect(summaryTitle("Kitchen reno — rip out old cabinets, install new benchtop")).toBe("Kitchen reno");
    expect(summaryTitle("frame a wall 4m x 2.4m")).toBe("Frame a wall 4m x 2.4m");
    expect(summaryTitle("insulate the exterior walls 24 m²")).toBe("Insulate the exterior walls 24 m²");
  });

  it("keeps decimal sizes whole", () => {
    expect(summaryTitle("Deck 5.4 x 4.8 m in H3.2 pine")).toBe("Deck 5.4 x 4.8 m in H3.2 pine");
  });

  it("cuts a long phrase at a word", () => {
    const title = summaryTitle(
      "Replace approximately 8 rotted decking boards on a small back deck, matching the existing H3.2 90x19 profile.",
    );
    expect(title!.length).toBeLessThanOrEqual(49);
    expect(title).toMatch(/^Replace approximately 8 rotted decking boards…$|…$/);
    expect(title).not.toMatch(/\s…$/);
  });

  it("ignores empty and stub summaries", () => {
    for (const s of ["", "  ", "job", "Estimate", "example", null, undefined]) expect(summaryTitle(s)).toBeNull();
  });

  it("falls back to the client, then the quote number", () => {
    expect(jobHeading({ summary: "Deck repair", clientName: "Sam Taylor", quoteNumber: "Q-1" })).toEqual({
      title: "Deck repair",
      subtitle: "Sam Taylor",
    });
    expect(jobHeading({ summary: "", clientName: "Sam Taylor", quoteNumber: "Q-1" })).toEqual({
      title: "Sam Taylor",
      subtitle: "Quote Q-1",
    });
    expect(jobHeading({ summary: "job", clientName: "TBC", quoteNumber: "Q-1" })).toEqual({ title: "Quote Q-1", subtitle: null });
  });

  it("first names skip placeholders", () => {
    expect(clientFirstName("Sam Taylor")).toBe("Sam");
    expect(clientFirstName("  Aroha  ")).toBe("Aroha");
    expect(clientFirstName("To be confirmed")).toBeNull();
    expect(realClientName("tbd")).toBeNull();
  });
});

describe("client details", () => {
  const client = { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" };

  it("moves an old single contact field into email or phone, like the classic editor", () => {
    expect(migrateLegacyContact({ name: "A", address: null, email: null, phone: null, contact: "a@b.co" }).email).toBe("a@b.co");
    expect(migrateLegacyContact({ name: "A", address: null, email: null, phone: null, contact: "021 1" }).phone).toBe("021 1");
    expect(migrateLegacyContact(null)).toEqual({ name: "", address: null, email: null, phone: null });
    expect(migrateLegacyContact(client)).toBe(client);
  });

  it("stores empty boxes as null and trims", () => {
    const form = { ...clientForm(client), email: "  ", name: " Sam T " };
    expect(clientFromForm(client, form)).toEqual({ ...client, name: "Sam T", email: null });
    expect(sameClient(clientFromForm(client, clientForm(client)), client)).toBe(true);
  });

  it("checks the email shape only when there is one", () => {
    expect(clientFormProblem({ ...clientForm(client), email: "sam at home" })).toBe("email");
    expect(clientFormProblem({ ...clientForm(client), email: "" })).toBeNull();
    expect(looksLikeEmail("sam@example.invalid")).toBe(true);
  });
});

describe("reminder message", () => {
  const body = "Hi Sam,\n\nJust a quick follow-up on quote Q-1.\n\nThanks,\nSTR8 Builders";

  it("adds the quote link above the sign-off", () => {
    expect(reminderText(body, "https://t2q.test/quote/abc")).toBe(
      "Hi Sam,\n\nJust a quick follow-up on quote Q-1.\n\nYou can see the quote and accept it here: https://t2q.test/quote/abc\n\nThanks,\nSTR8 Builders",
    );
  });

  it("leaves it alone without a link", () => {
    expect(reminderText(body, null)).toBe(body);
  });

  it("builds the client's link like the send routes", () => {
    expect(publicQuoteLink("https://t2q.test/", "abc")).toBe("https://t2q.test/quote/abc");
    expect(publicQuoteLink("https://t2q.test", null)).toBeNull();
  });
});

describe("dates the job page prints", () => {
  const now = new Date("2026-09-25T00:00:00.000Z");

  it("short NZ days", () => {
    expect(shortDate("2026-09-22T03:00:00.000Z")).toBe("22 Sept");
    expect(shortDate(null)).toBeNull();
    expect(shortDate("not a date")).toBeNull();
  });

  it("booked day from scheduled_for", () => {
    expect(bookedDateKey("2026-09-30")).toBe("2026-09-30");
    expect(bookedDateKey("2026-09-30T00:00:00+00:00")).toBe("2026-09-30");
    expect(bookedDateKey("garbage")).toBeNull();
    expect(bookedDayLabel("2026-09-30")).toBe("Wed, 30 Sept");
  });

  it("past expiry", () => {
    expect(isPastExpiry("2026-09-24T00:00:00.000Z", now)).toBe(true);
    expect(isPastExpiry("2026-10-24T00:00:00.000Z", now)).toBe(false);
    expect(isPastExpiry(null, now)).toBe(false);
  });

  it("days late only for unpaid sent invoices past their due date", () => {
    expect(invoiceDaysLate("sent", "2026-09-16T00:00:00.000Z", now)).toBe(9);
    expect(invoiceDaysLate("overdue", "2026-09-24T12:00:00.000Z", now)).toBe(0);
    expect(invoiceDaysLate("paid", "2026-09-01T00:00:00.000Z", now)).toBe(0);
    expect(invoiceDaysLate("draft", "2026-09-01T00:00:00.000Z", now)).toBe(0);
    expect(invoiceDaysLate("sent", null, now)).toBe(0);
  });

  it("invoice state for the view", () => {
    expect(
      invoiceState({ status: "sent", invoice_number: "INV-1", due_date: "2026-09-16T00:00:00.000Z", paid_at: null }, now),
    ).toEqual({ status: "sent", number: "INV-1", dueOn: "16 Sept", daysLate: 9, paidOn: null });
  });

  it("local day keys for the date picker", () => {
    expect(localDateKey(new Date(2026, 8, 30), 1)).toBe("2026-10-01");
    expect(localDateKey(new Date(2026, 11, 31), 0)).toBe("2026-12-31");
  });
});

describe("which job page renders", () => {
  it("the switch off always gets the classic page", () => {
    expect(jobPageLook(false, undefined)).toBe("classic");
    expect(jobPageLook(false, "new")).toBe("classic");
  });

  it("the switch on gets the new look, with the classic page on request", () => {
    expect(jobPageLook(true, undefined)).toBe("new");
    expect(jobPageLook(true, "classic")).toBe("classic");
    expect(jobPageLook(true, ["classic", "x"])).toBe("classic");
    expect(jobPageLook(true, "something")).toBe("new");
  });
});
