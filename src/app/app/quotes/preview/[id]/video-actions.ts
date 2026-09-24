"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/quote-video/constants";
import {
  QUOTE_VIDEO_MESSAGES,
  loadQuoteVideoStatus,
  requestQuoteVideo,
  type QuoteVideoResult,
} from "@/lib/quote-video/owner";

/**
 * Quote video server actions for the owner's quote page. The owner comes from
 * the session (auth.getUser()); the browser only names the quote, and every
 * read is scoped to that owner.
 */

async function owner() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? { db, userId: user.id } : null;
}

/** Ask for a video of the quote as it is now, then report the new status. */
export async function requestQuoteVideoAction(quoteId: string): Promise<QuoteVideoResult> {
  if (!isUuid(quoteId)) return { ok: false, error: QUOTE_VIDEO_MESSAGES.notFound };
  const session = await owner();
  if (!session) return { ok: false, error: QUOTE_VIDEO_MESSAGES.signIn };
  const requested = await requestQuoteVideo(session.db, quoteId);
  if (!requested.ok) return requested;
  return loadQuoteVideoStatus(session.db, adminClient(), session.userId, quoteId);
}

/** Status for the card's polling; signed video and poster URLs (1 hour) once ready. */
export async function getQuoteVideoStatusAction(quoteId: string): Promise<QuoteVideoResult> {
  if (!isUuid(quoteId)) return { ok: false, error: QUOTE_VIDEO_MESSAGES.notFound };
  const session = await owner();
  if (!session) return { ok: false, error: QUOTE_VIDEO_MESSAGES.signIn };
  return loadQuoteVideoStatus(session.db, adminClient(), session.userId, quoteId);
}
