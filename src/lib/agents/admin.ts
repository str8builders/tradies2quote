/**
 * Admin Agent — checks the user's settings + records for obvious gaps.
 *
 * Pure function. Reads the user's profile + a sample of their client
 * rows and returns a checklist of setup items, each tagged with where
 * the user should go to fix it.
 *
 * Safety:
 *   - No I/O. The caller is responsible for fetching the profile +
 *     clients rows; this function just analyses them.
 *   - Never modifies anything. Every "Apply" in the UI is a `<Link>`
 *     to an existing page, not a server action.
 */

export type AdminSeverity = "complete" | "warn" | "missing";

export interface AdminFinding {
  id: string;
  label: string;
  status: AdminSeverity;
  detail: string;
  /** Existing page where the user fixes this. */
  fixHref: string;
  fixLabel: string;
}

export interface AdminProfileSnapshot {
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gst_number: string | null;
  country: string | null;
  currency: string | null;
  tax_rate: number | null;
  default_labour_rate: number | null;
  default_markup_pct: number | null;
}

export interface AdminClientSnapshot {
  /** How many clients exist in the user's clients table. */
  count: number;
  /** How many of those have a missing email AND missing phone. */
  countWithoutContact: number;
}

function isNonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function runAdminAgent(
  profile: AdminProfileSnapshot | null,
  clients: AdminClientSnapshot,
): AdminFinding[] {
  const out: AdminFinding[] = [];

  out.push({
    id: "business_name",
    label: "Business name",
    status: isNonEmpty(profile?.business_name) ? "complete" : "missing",
    detail: isNonEmpty(profile?.business_name)
      ? "Set — appears on quote PDFs."
      : "Quote PDFs will read 'Your business' until this is set.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  out.push({
    id: "contact",
    label: "Business email or phone",
    status:
      isNonEmpty(profile?.email) || isNonEmpty(profile?.phone)
        ? "complete"
        : "missing",
    detail:
      isNonEmpty(profile?.email) || isNonEmpty(profile?.phone)
        ? "Clients can reach you back from the quote PDF."
        : "Add at least one contact channel so clients can reply.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  out.push({
    id: "address",
    label: "Business address",
    status: isNonEmpty(profile?.address) ? "complete" : "warn",
    detail: isNonEmpty(profile?.address)
      ? "Shown on PDFs."
      : "Useful for invoices but not required to send quotes.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  out.push({
    id: "gst_number",
    label: "GST / tax registration number",
    status: isNonEmpty(profile?.gst_number) ? "complete" : "warn",
    detail: isNonEmpty(profile?.gst_number)
      ? "Appears on invoiced quotes."
      : "Required on invoices once you're GST-registered in NZ. Optional otherwise.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  out.push({
    id: "tax_rate",
    label: "Default GST rate",
    status: (profile?.tax_rate ?? 0) > 0 ? "complete" : "warn",
    detail:
      (profile?.tax_rate ?? 0) > 0
        ? `Default is ${profile?.tax_rate}% — change in Settings.`
        : "Quotes will compute 0% tax — confirm this matches your registration.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  out.push({
    id: "labour_rate",
    label: "Default labour rate",
    status:
      (profile?.default_labour_rate ?? 0) > 0 ? "complete" : "missing",
    detail:
      (profile?.default_labour_rate ?? 0) > 0
        ? `Set at ${profile?.currency ?? ""} ${profile?.default_labour_rate}/hr.`
        : "AI quote generation needs a labour rate to estimate hours.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  out.push({
    id: "markup_pct",
    label: "Default markup (materials + other items)",
    status:
      (profile?.default_markup_pct ?? 0) > 0 ? "complete" : "warn",
    detail:
      (profile?.default_markup_pct ?? 0) > 0
        ? `Adding ${profile?.default_markup_pct}% to materials and other items.`
        : "Quotes will show materials and other items at cost. Most tradies mark up 15–25%.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  out.push({
    id: "currency",
    label: "Currency + country",
    status:
      isNonEmpty(profile?.currency) && isNonEmpty(profile?.country)
        ? "complete"
        : "warn",
    detail:
      isNonEmpty(profile?.currency) && isNonEmpty(profile?.country)
        ? `${profile?.currency} · ${profile?.country}`
        : "Used for currency formatting and tax labels on quotes.",
    fixHref: "/app/settings",
    fixLabel: "Open Settings",
  });

  if (clients.count > 0) {
    out.push({
      id: "client_contacts",
      label: "Clients missing email and phone",
      status:
        clients.countWithoutContact === 0
          ? "complete"
          : clients.countWithoutContact <= 2
            ? "warn"
            : "missing",
      detail:
        clients.countWithoutContact === 0
          ? "Every client has at least one contact channel."
          : `${clients.countWithoutContact} client${clients.countWithoutContact === 1 ? "" : "s"} have no email and no phone — re-sending quotes will fail.`,
      fixHref: "/app/clients",
      fixLabel: "Open Clients",
    });
  }

  return out;
}

export interface AdminSummary {
  status: "ready" | "review" | "missing";
  ready: number;
  warn: number;
  missing: number;
  total: number;
}

export function summarizeAdmin(findings: AdminFinding[]): AdminSummary {
  let ready = 0;
  let warn = 0;
  let missing = 0;
  for (const f of findings) {
    if (f.status === "complete") ready += 1;
    else if (f.status === "warn") warn += 1;
    else missing += 1;
  }
  const total = findings.length;
  const status: AdminSummary["status"] =
    missing > 0 ? "missing" : warn > 0 ? "review" : "ready";
  return { status, ready, warn, missing, total };
}
