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
