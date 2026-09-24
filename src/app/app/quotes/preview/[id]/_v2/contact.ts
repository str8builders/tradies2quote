/**
 * Client details and the messages that go to them. Pure: tested in node.
 */

import type { QuoteClient } from "@/lib/quote-types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same shape check the send gate uses. */
export function looksLikeEmail(value: string | null | undefined): boolean {
  return EMAIL_RE.test((value ?? "").trim());
}

/**
 * Older quotes kept one "contact" field holding an email or a phone. Move it
 * into the right field, like the classic editor does when it loads a quote.
 */
export function migrateLegacyContact(client: QuoteClient | null | undefined): QuoteClient {
  const safe: QuoteClient = client ?? { name: "", address: null, email: null, phone: null };
  if (safe.email || safe.phone || !safe.contact) return safe;
  const legacy = safe.contact.trim();
  return EMAIL_RE.test(legacy) ? { ...safe, email: legacy } : { ...safe, phone: legacy };
}

export interface ClientForm {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export function clientForm(client: QuoteClient): ClientForm {
  return {
    name: client.name ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    address: client.address ?? "",
  };
}

/** Empty boxes are stored as null, the way the classic editor stores them. */
export function clientFromForm(base: QuoteClient, form: ClientForm): QuoteClient {
  const orNull = (value: string) => (value.trim() ? value.trim() : null);
  return {
    ...base,
    name: form.name.trim(),
    phone: orNull(form.phone),
    email: orNull(form.email),
    address: orNull(form.address),
  };
}

export function clientFormProblem(form: ClientForm): "email" | null {
  return form.email.trim() && !looksLikeEmail(form.email) ? "email" : null;
}

export function sameClient(a: QuoteClient, b: QuoteClient): boolean {
  return (
    (a.name ?? "") === (b.name ?? "") &&
    (a.phone ?? null) === (b.phone ?? null) &&
    (a.email ?? null) === (b.email ?? null) &&
    (a.address ?? null) === (b.address ?? null)
  );
}

/** The client's quote link, as the send routes build it. */
export function publicQuoteLink(appUrl: string, token: string | null | undefined): string | null {
  return token ? `${appUrl.replace(/\/+$/, "")}/quote/${token}` : null;
}

/**
 * A follow-up message with the quote link added just above the sign-off
 * (the templates end with "Thanks,\nBusiness").
 */
export function reminderText(body: string, link: string | null): string {
  if (!link) return body;
  const paragraphs = body.split("\n\n");
  const line = `You can see the quote and accept it here: ${link}`;
  if (paragraphs.length < 2) return `${body}\n\n${line}`;
  return [...paragraphs.slice(0, -1), line, paragraphs[paragraphs.length - 1]].join("\n\n");
}
