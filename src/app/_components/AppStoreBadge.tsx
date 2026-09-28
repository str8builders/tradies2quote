import { APP_STORE_BADGE_SRC, appStoreId, appStoreUrl } from "@/lib/app-store";

/**
 * "Download on the App Store", linking to the iPhone app's listing. Renders
 * nothing until the app is published (see src/lib/app-store.ts), and pages
 * that show inside the iPhone app shouldn't use it.
 */
export function AppStoreBadge({ height = 48, className = "" }: { height?: number; className?: string }) {
  const id = appStoreId();
  if (!id) return null;
  return (
    <a
      href={appStoreUrl(id)}
      className={`inline-block ${className}`}
      data-testid="app-store-badge"
      aria-label="Download Tradies2Quote on the App Store"
    >
      {/* Apple's own badge artwork, unaltered (served by Apple). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={APP_STORE_BADGE_SRC} alt="Download on the App Store" height={height} width={Math.round((height * 250) / 83)} style={{ height, width: "auto" }} />
    </a>
  );
}
