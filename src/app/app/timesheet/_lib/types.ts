/** The Timesheet screen's data, as plain objects (server → client). */

export interface TimesheetEntry {
  id: string;
  workDate: string;
  /** "07:00" */
  start: string;
  finish: string;
  breakMinutes: number;
  hours: number;
  note: string | null;
  clientId: string | null;
  clientName: string | null;
  userId: string;
  /** "You", or the team member's name. */
  person: string;
  /** Logged by the signed-in person (so theirs to change while unbilled). */
  mine: boolean;
  /** On a live invoice: locked. */
  invoice: { id: string; number: string } | null;
  /** From clocking in and out: where the start and finish pins were. */
  pins: { start: string | null; end: string | null } | null;
  /** Kilometres travelled while clocked in (from the route), or null. */
  km: number | null;
  /**
   * The client's job site on the map (pinned on site, or found from the
   * address), with the client's address; null when there's no site yet.
   * Optional: hours built elsewhere (previews) leave it out.
   */
  site?: { lat: number; lng: number; address: string | null } | null;
  /** The client's address, for hours at a client whose job isn't on the map yet. */
  address?: string | null;
  /** From clocking in and out: where you started and finished, when location was on. */
  clockPoints?: { start: EntryPoint | null; end: EntryPoint | null } | null;
}

/** A spot on the map. */
export interface EntryPoint {
  lat: number;
  lng: number;
}

export interface TimesheetClient {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
}

export interface TimesheetPerson {
  userId: string;
  name: string;
}

export interface TimesheetData {
  /** Monday of the week shown. */
  weekStart: string;
  /** Today in the business's time zone. */
  today: string;
  entries: TimesheetEntry[];
  clients: TimesheetClient[];
  /** The business owner: sees the team's hours and invoices them. */
  canInvoice: boolean;
  people: TimesheetPerson[];
  labourRate: number;
  currency: string;
  taxLabel: string;
  taxRate: number;
  /** The week's hours couldn't be read: say so, don't show an empty week. */
  failed: boolean;
  /** Your last travel rate on an invoice ($ per km), to fill the field. */
  travelRate: number | null;
}
