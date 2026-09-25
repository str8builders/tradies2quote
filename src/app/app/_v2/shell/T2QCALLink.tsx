import Image from "next/image";
import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP } from "@/components/ui/styles";

/** Where T2QCAL opens: its calculators, same site and same login. */
export const T2QCAL_HREF = "/t2qcal/calculators";

/** T2QCAL one tap from every tab: its own app icon, top right. */
export function T2QCALLink({ className }: { className?: string }) {
  return (
    <Link
      href={T2QCAL_HREF}
      aria-label="Open T2QCAL calculators"
      title="T2QCAL calculators"
      data-testid="top-bar-t2qcal"
      className={cx(
        "ui-focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-ui-md",
        TAP,
        PRESS,
        className,
      )}
    >
      <Image
        src="/t2qcal/native-icon.png"
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 rounded-ui-md border border-ui-line"
      />
    </Link>
  );
}
