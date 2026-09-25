"use client";

import { useLayoutEffect } from "react";
import { WELCOME_SEEN_COOKIE } from "@/lib/welcome-cookie";

/** Local preview only: forget "seen the welcome" so it plays on every visit. */
export function ForgetWelcome() {
  useLayoutEffect(() => {
    document.cookie = `${WELCOME_SEEN_COOKIE}=; Max-Age=0; Path=/`;
  }, []);
  return null;
}
