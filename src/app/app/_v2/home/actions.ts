"use server";

import { cookies } from "next/headers";
import { SETUP_DISMISSED_COOKIE, SETUP_DISMISSED_MAX_AGE_S } from "../lib/setup-steps";

/**
 * "Hide this" on the Home setup card: remembered on this device with a
 * plain cookie (like outdoor mode), no database write. Setting a cookie in
 * a server action re-renders the page, so the card is gone at once.
 */
export async function dismissSetupCard(): Promise<void> {
  const store = await cookies();
  store.set(SETUP_DISMISSED_COOKIE, "1", {
    path: "/",
    maxAge: SETUP_DISMISSED_MAX_AGE_S,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
