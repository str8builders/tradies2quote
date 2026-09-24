import type { HTMLAttributes } from "react";
import { formatCurrency } from "@/lib/quote-defaults";
import { cx } from "./cx";

export type MoneyProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  amount: number;
  /** ISO code; NZD, AUD, GBP, USD and CAD print their symbol ("$", "£"). */
  currency?: string;
};

/**
 * An amount of money in the app's one format (formatCurrency: same output on
 * server and phone, so no hydration mismatch), with tabular figures so
 * columns of prices line up.
 */
export function Money({ amount, currency = "NZD", className, ...rest }: MoneyProps) {
  return (
    <span
      {...rest}
      data-amount={Number.isFinite(amount) ? amount : 0}
      className={cx("tabular-nums whitespace-nowrap", className)}
    >
      {formatCurrency(amount, currency)}
    </span>
  );
}
