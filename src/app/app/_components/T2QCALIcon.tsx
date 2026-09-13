import Image from "next/image";

/** The companion app's existing icon, shared by its dashboard and header links. */
export function T2QCALIcon({ size = 48 }: { size?: number }) {
  return <Image src="/t2qcal/native-icon.png" alt="" width={size} height={size}
    className="t2q-cal-icon" aria-hidden="true" />;
}
