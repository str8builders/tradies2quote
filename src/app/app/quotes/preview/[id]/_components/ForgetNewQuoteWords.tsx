"use client";

import { useEffect } from "react";
import { forgetSentJob, sessionStore } from "../../../new/_v2/lib/saved-job";

/**
 * The new-quote page keeps the tradie's words in this tab until the draft
 * quote exists. This is the quote page loading: words that were sent to
 * createDraftQuote (and any recording kept with them) are cleared. Words
 * still being typed for another quote are left alone. Renders nothing.
 */
export function ForgetNewQuoteWords() {
  useEffect(() => {
    forgetSentJob(sessionStore(), Date.now());
  }, []);
  return null;
}
