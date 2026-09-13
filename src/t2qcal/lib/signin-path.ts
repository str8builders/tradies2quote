import {safeNextPath} from "@/lib/safe-redirect";

/** Only T2QCAL destinations, so an installed T2QCAL never leaves its own scope after sign-in. */
export function calculatorNextPath(raw:unknown):string{
  const path=safeNextPath(raw,"/t2qcal/calculators");
  return path==="/t2qcal"||path.startsWith("/t2qcal/")?path:"/t2qcal/calculators";
}
