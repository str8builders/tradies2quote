import Link from "next/link";
import { BUSINESS_NAME_REQUIRED } from "@/lib/business-name";

export function BusinessSettingsLink() {
  return <Link href={BUSINESS_NAME_REQUIRED.settings_url} className="ml-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Open Settings</Link>;
}
