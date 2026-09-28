import type { ComponentProps, ReactNode } from "react";
import type { ScanBarcodeButton } from "@/app/app/materials/_components/ScanBarcodeButton";
import type { LibraryMaterial, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import type { QuoteVideoStatus } from "@/lib/quote-video/status";
import type { JobInvoiceState, JobViewInput } from "./job-view";
import type { JobKit } from "./kits";

/** A library item the barcode scanner can add (ScanBarcodeButton's own prop type). */
export type LibraryPick = NonNullable<ComponentProps<typeof ScanBarcodeButton>["library"]>[number];

/**
 * A library item a line is matched to (line.library_id), with what the
 * classic editor shows about it: whether its saved price is itself a T2Q
 * estimate, the supplier and their product page (http/https only).
 */
export type LineLibraryItem = Pick<
  LibraryMaterial,
  "id" | "name" | "default_unit_price" | "supplier" | "supplier_url" | "is_ai_estimated"
>;

/** An invoice as the job page shows it (server-computed dates, no clock on the phone). */
export interface JobInvoice extends JobInvoiceState {
  id: string;
  total: number;
  currency: string;
}

/** A panel from the classic page, rendered on the server, shown in "More tools". */
export interface ServerTool {
  id: string;
  title: string;
  subtitle?: string;
  content: ReactNode;
}

export interface DayNote {
  id: string;
  body: string;
}

/** Everything the new job page needs, loaded and worked out on the server. */
export interface JobScreenProps {
  quoteId: string;
  quoteNumber: string;
  /** quotes.status (server truth; it moves only through actions and routes). */
  status: string;
  /** quote_data after the review guard, like the classic editor gets. */
  data: QuoteData;
  /** Lines the review guard left out ("never silent"). */
  stripped: string[];
  /** voice_transcript ?? job_summary, the send gate's evidence. */
  description: string | null;
  /** The client's working quote link, when there is one. */
  publicLink: string | null;
  hasPdf: boolean;
  pastExpiry: boolean;
  dates: NonNullable<JobViewInput["dates"]>;
  /** YYYY-MM-DD the job is booked for. */
  bookedDate: string | null;
  invoice: JobInvoice | null;
  /** Why an invoice can't be made yet (runInvoiceAgent), when completed. */
  invoiceBlockers: string[];
  hasBusinessName: boolean;
  /** A platform text sender is configured (else the phone's Messages app). */
  smsEnabled: boolean;
  /** The follow-up message to send now (sent / viewed quotes). */
  reminder: { label: string; body: string } | null;
  /** With the use count and last use: the library matcher breaks ties on them, as the classic page does. */
  library: Array<LibraryPick & { usage_count?: number; last_used_at?: string | null }>;
  /** The library items the lines are matched to, for where each price came from. */
  libraryMatches?: LineLibraryItem[];
  /**
   * A quote made from a supplier's quote: its lines as scanned in
   * (quotes.ai_snapshot), so the supplier check can name a line taken off
   * since. Null otherwise.
   */
  supplierImported?: QuoteLineItem[] | null;
  /** The iPhone app with no AI consent on record: ask before the first plan photo goes (App Store 5.1.2(i)). */
  needsAiConsent?: boolean;
  video: { status: QuoteVideoStatus; version: number; shareText?: string } | null;
  dayNotes: DayNote[];
  serverTools: ServerTool[];
  /**
   * The tradie's kits for "Add a kit" (lib/kits getKitsWithItems), or null
   * while kits are switched off (kitsEnabled), which hides the control.
   */
  kits?: JobKit[] | null;
}
