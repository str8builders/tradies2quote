"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { settingsPathForHash } from "./hub";

/**
 * Old links such as /app/settings#request-link still arrive from the account
 * menu, the dashboard and the request poster. The hash never reaches the
 * server, so the hub forwards them here, in the browser.
 */
export function HashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const target = settingsPathForHash(window.location.hash);
    if (target) router.replace(target);
  }, [router]);
  return null;
}
