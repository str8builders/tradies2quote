// ─────────────────────────────────────────────────────────────────────────
// Reading documents with the AI, one page (photo or PDF) at a time — the
// order of events, without React, so it can be tested on its own.
//
//   - In the iPhone app the tradie is asked for AI consent BEFORE the first
//     page is sent (App Store 5.1.2(i)); a page the server turns away for
//     consent asks again, then that page is tried once more.
//   - A page that fails doesn't throw the others away: each page gets its
//     own outcome, and the screen offers to try just the failed ones again.
//   - An answer that applies to every page (new quotes paused, the daily
//     limit) stops the run: the rest would fail the same way.
// Client-safe.
// ─────────────────────────────────────────────────────────────────────────

/** What one upload came back with. */
export type PageAnswer<P> =
  | { ok: true; page: P }
  | { ok: false; status: number; error: string; code?: string };

export type PageOutcome<P> =
  | { index: number; ok: true; page: P }
  | { index: number; ok: false; error: string };

export type ReadPagesResult<P> = {
  outcomes: Array<PageOutcome<P>>;
  /** The tradie said no to AI: nothing was sent. */
  declined: boolean;
};

/** Answers that mean every other page would fail the same way. */
function stopsTheRun(answer: { status: number }): boolean {
  return answer.status === 401 || answer.status === 402 || answer.status === 429 || answer.status === 503;
}

export async function readPagesInTurn<P>(args: {
  /** Page indexes to read, in order. */
  indexes: number[];
  /** True in the iPhone app until consent is on record. */
  consentNeeded: boolean;
  /** Show the consent step; resolves true once given. */
  askConsent: () => Promise<boolean>;
  read: (index: number) => Promise<PageAnswer<P>>;
  /** Called before each page is sent (progress). */
  onPage?: (index: number, position: number) => void;
}): Promise<ReadPagesResult<P>> {
  const outcomes: Array<PageOutcome<P>> = [];
  let consented = !args.consentNeeded;
  if (!consented) {
    consented = await args.askConsent();
    if (!consented) return { outcomes, declined: true };
  }
  for (let position = 0; position < args.indexes.length; position++) {
    const index = args.indexes[position];
    args.onPage?.(index, position);
    let answer = await args.read(index);
    if (!answer.ok && answer.status === 403 && answer.code === "ai_consent_required") {
      // Consent was withdrawn (or never recorded): ask, then try this page again.
      if (!(await args.askConsent())) return { outcomes, declined: true };
      answer = await args.read(index);
    }
    if (answer.ok) {
      outcomes.push({ index, ok: true, page: answer.page });
      continue;
    }
    outcomes.push({ index, ok: false, error: answer.error });
    if (stopsTheRun(answer)) {
      for (const rest of args.indexes.slice(position + 1)) {
        outcomes.push({ index: rest, ok: false, error: answer.error });
      }
      break;
    }
  }
  return { outcomes, declined: false };
}

/** A /api/materials/extract-quote response as a page answer. */
export async function pageAnswerFromResponse<P>(res: Response): Promise<PageAnswer<P>> {
  if (res.ok) return { ok: true, page: (await res.json()) as P };
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return {
    ok: false,
    status: res.status,
    code: data.error,
    error: data.message ?? data.error ?? "Could not read that.",
  };
}

/**
 * One page's upload as an answer: a dropped connection or a timeout fails
 * just that page (the others are kept); a cancel by the tradie still stops
 * the whole run.
 */
export async function answerPage<P>(send: () => Promise<Response>): Promise<PageAnswer<P>> {
  let res: Response;
  try {
    res = await send();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "Network error. Please try again." };
  }
  return pageAnswerFromResponse<P>(res);
}
