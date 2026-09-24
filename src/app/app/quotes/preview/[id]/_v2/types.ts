import type { ComponentProps, ReactNode } from "react";
import type { ScanBarcodeButton } from "@/app/app/materials/_components/ScanBarcodeButton";
import type { QuoteData } from "@/lib/quote-types";
import type { QuoteVideoStatus } from "@/lib/quote-video/status";
import type { JobInvoiceState, JobViewInput } from "./job-view";

/** A library item the barcode scanner can add (ScanBarcodeButton's own prop type). */
export type LibraryPick = NonNullable<ComponentProps<typeof ScanBarcodeButton>["library"]>[number];

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
  library: LibraryPick[];
  video: { status: QuoteVideoStatus; version: number; shareText?: string } | null;
  dayNotes: DayNote[];
  serverTools: ServerTool[];
}
