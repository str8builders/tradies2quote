/**
 * Kits on the job page. A kit (Prices › Kits, lib/kits) is a named set of
 * lines the tradie saved once; "Add a kit" puts all of them on the quote in
 * one tap. Pure: tested in node.
 */

import type { QuoteItemType, QuoteLineItem } from "@/lib/quote-types";
import { blankLine, updateLine } from "./lines";

/** Where kits are made and changed. */
export const KITS_PAGE = "/app/materials/kits";

/** One saved kit line (lib/kits KitItem), with its library link when the kit keeps one. */
export interface KitLineSource {
  type: QuoteItemType;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  /** The tradie's library item the line came from. */
  library_id?: string | null;
  material_id?: string | null;
}

/** A kit as the job page gets it from the server. */
export interface JobKit {
  id: string;
  name: string;
  items: KitLineSource[];
  /** What its lines add up to before tax (lib/kits kitTotal). */
  total: number;
}

const usable = (n: unknown): number => {
  const value = Number(n);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * The quote lines for a kit, each made the way the "Add a line" sheet makes a
 * line: a blank line of its type, then the saved name, quantity, unit and
 * price through the shared edit rule (updateLine), so totals, the $0 check,
 * the send gate and saving treat them like lines typed by hand. The library
 * link rides along when the kit keeps one. Lines with no name are skipped;
 * a quantity or price that isn't a positive number comes in as 0 (the $0
 * line then asks for its price, like any other).
 */
export function kitLines(kit: Pick<JobKit, "items">): QuoteLineItem[] {
  return kit.items.flatMap((item) => {
    const description = (item.description ?? "").trim();
    if (!description) return [];
    const blank = blankLine(item.type);
    const line = updateLine(blank, {
      description,
      quantity: usable(item.quantity),
      unit: item.unit?.trim() || blank.unit,
      unit_price: usable(item.unit_price),
    });
    const link = item.library_id ?? item.material_id ?? null;
    return [link ? { ...line, library_id: link, material_id: item.material_id ?? link } : line];
  });
}

/** "6 lines" / "1 line" / "No lines yet". */
export function kitLineCount(kit: Pick<JobKit, "items">): string {
  const n = kit.items.filter((item) => (item.description ?? "").trim()).length;
  if (n === 0) return "No lines yet";
  return `${n} ${n === 1 ? "line" : "lines"}`;
}

/** The toast once a kit is on the quote. */
export function kitAddedMessage(kit: Pick<JobKit, "name">, added: number): string {
  return `Added ${kit.name.trim() || "the kit"}: ${added} ${added === 1 ? "line" : "lines"}`;
}
