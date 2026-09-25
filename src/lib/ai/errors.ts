// ─────────────────────────────────────────────────────────────────────────
// Typed AI errors.
//
// Every failure the shared AI client raises is an `AiError` with a `kind`.
// Each kind has ONE plain-English sentence a tradie may see (`userMessage`)
// and the HTTP status a route should answer with. The upstream detail
// (provider error type, a clipped body) stays in `detail` for server logs and
// the error monitor — it is never meant for a client.
//
// Browser-safe: no Node or server-only imports.
// ─────────────────────────────────────────────────────────────────────────

export type AiProvider = "anthropic" | "openai" | "local";

export type AiErrorKind =
  /** 429 — the provider's rate limit. */
  | "rate_limited"
  /** 529 / 503 — the provider is at capacity. */
  | "overloaded"
  /** Our per-call timeout fired, or the provider answered 408 / 504. */
  | "timeout"
  /** Network failure or a 5xx other than overload. */
  | "unavailable"
  /** A 4xx the request itself caused (400, 404, 413, 422 …). Not retried. */
  | "bad_request"
  /** 401 / 402 / 403 — our key, billing or permissions. Not retried. */
  | "auth"
  /** `stop_reason: "refusal"` (or an OpenAI refusal / content filter). */
  | "refused"
  /** The reply hit its output cap (`max_tokens` / `length`). */
  | "truncated"
  /** The reply arrived but could not be used (no tool call, bad JSON …). */
  | "invalid_output"
  /** No API key / base URL configured for this provider. */
  | "not_configured";

export const AI_ERROR_KINDS: readonly AiErrorKind[] = [
  "rate_limited",
  "overloaded",
  "timeout",
  "unavailable",
  "bad_request",
  "auth",
  "refused",
  "truncated",
  "invalid_output",
  "not_configured",
];

/** The sentence a tradie (or a customer on the public page) may see. */
export const AI_ERROR_MESSAGES: Readonly<Record<AiErrorKind, string>> = {
  rate_limited:
    "The AI service is busy right now. Please wait a minute and try again.",
  overloaded:
    "The AI service is overloaded right now. Please try again in a minute.",
  timeout: "The AI took too long to answer. Please try again.",
  unavailable:
    "The AI service couldn't be reached. Please try again in a moment.",
  bad_request:
    "The AI couldn't process that request. Check what you sent and try again.",
  auth: "The AI service isn't available right now. Please try again later.",
  refused:
    "The AI declined to answer that request. Try rewording it and try again.",
  truncated:
    "That was too long for the AI to finish in one go. Try a shorter request or split it up.",
  invalid_output:
    "The AI's answer came back in a form we couldn't use. Please try again.",
  not_configured: "This AI feature isn't set up yet.",
};

/** The status a route answers with for each kind. */
export const AI_ERROR_HTTP_STATUS: Readonly<Record<AiErrorKind, number>> = {
  rate_limited: 503,
  overloaded: 503,
  timeout: 504,
  unavailable: 502,
  bad_request: 502,
  auth: 503,
  refused: 422,
  truncated: 422,
  invalid_output: 502,
  not_configured: 503,
};

const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  local: "Local LLM",
};

export interface AiErrorInit {
  kind: AiErrorKind;
  provider?: AiProvider | null;
  /** Upstream HTTP status, when there was a response. */
  status?: number | null;
  /** How many HTTP attempts were made before giving up. */
  attempts?: number;
  /** Parsed `retry-after`, when the provider sent one. */
  retryAfterMs?: number | null;
  /** Server-side detail. Clipped; never shown to a client. */
  detail?: string;
  /** Technical message for logs. Defaults to a generated one. */
  message?: string;
  cause?: unknown;
}

const DETAIL_MAX = 300;

/** Remove anything that looks like a credential before it reaches a log. */
export function scrubSecrets(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, "sk-[redacted]")
    .replace(/(x-api-key|authorization|api[_-]?key)(["'\s:=]+)(bearer\s+)?[^\s"',}]+/gi, "$1$2[redacted]");
}

function clip(text: string, max = DETAIL_MAX): string {
  const flat = scrubSecrets(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly provider: AiProvider | null;
  readonly status: number | null;
  readonly attempts: number;
  readonly retryAfterMs: number | null;
  /** Server-side detail. Log it; never return it to a client. */
  readonly detail: string;

  constructor(init: AiErrorInit) {
    const provider = init.provider ?? null;
    const status = init.status ?? null;
    const attempts = init.attempts ?? 1;
    super(
      init.message ??
        [
          provider ? PROVIDER_LABEL[provider] : "AI",
          init.kind.replace(/_/g, " "),
          status ? `(HTTP ${status})` : "",
          attempts > 1 ? `after ${attempts} attempts` : "",
        ]
          .filter(Boolean)
          .join(" "),
      init.cause !== undefined ? { cause: init.cause } : undefined,
    );
    this.name = "AiError";
    this.kind = init.kind;
    this.provider = provider;
    this.status = status;
    this.attempts = attempts;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.detail = init.detail ? clip(init.detail) : "";
  }

  /** The plain-English sentence a tradie may see. */
  get userMessage(): string {
    return AI_ERROR_MESSAGES[this.kind];
  }

  /** The status a route should answer with. */
  get httpStatus(): number {
    return AI_ERROR_HTTP_STATUS[this.kind];
  }

  /** A copy with a different attempt count (the retry loop fills it in). */
  withAttempts(attempts: number): AiError {
    return new AiError({
      kind: this.kind,
      provider: this.provider,
      status: this.status,
      attempts,
      retryAfterMs: this.retryAfterMs,
      detail: this.detail,
      cause: this.cause,
    });
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError;
}

/**
 * Kind for an upstream HTTP status, refined by the provider's error type
 * (`overloaded_error`, `rate_limit_error` …) when the body carried one.
 */
export function classifyHttpStatus(
  status: number,
  errorType?: string | null,
): AiErrorKind {
  switch (errorType) {
    case "overloaded_error":
      return "overloaded";
    case "rate_limit_error":
      return "rate_limited";
    case "authentication_error":
    case "permission_error":
    case "billing_error":
      return "auth";
    case "timeout_error":
      return "timeout";
  }
  if (status === 429) return "rate_limited";
  if (status === 529 || status === 503) return "overloaded";
  if (status === 408 || status === 504) return "timeout";
  if (status === 401 || status === 402 || status === 403) return "auth";
  if (status >= 500) return "unavailable";
  if (status === 409) return "unavailable";
  return "bad_request";
}

/** Pull `error.type` / `error.message` out of a provider error body. */
export function parseProviderError(body: string): {
  type: string | null;
  message: string | null;
} {
  try {
    const parsed = JSON.parse(body) as {
      error?: { type?: unknown; message?: unknown; code?: unknown } | string;
      type?: unknown;
    };
    const err = parsed?.error;
    if (err && typeof err === "object") {
      const type =
        typeof err.type === "string"
          ? err.type
          : typeof err.code === "string"
            ? err.code
            : null;
      return {
        type,
        message: typeof err.message === "string" ? err.message : null,
      };
    }
    if (typeof err === "string") return { type: null, message: err };
    return { type: typeof parsed?.type === "string" ? parsed.type : null, message: null };
  } catch {
    return { type: null, message: null };
  }
}

export interface AiHttpErrorBody {
  /** Plain-English sentence, safe to show. */
  error: string;
  /** Machine-readable kind for clients that branch on it. */
  code: AiErrorKind | "unknown";
}

/**
 * Map any error to what a route may send back: a plain sentence and a
 * status. Unknown (non-AI) errors become a generic 502 — their text never
 * reaches the client. `messages` lets a route phrase a kind for its feature
 * ("Photo reading took too long …").
 */
export function aiErrorResponse(
  e: unknown,
  opts: {
    fallbackMessage?: string;
    messages?: Partial<Record<AiErrorKind, string>>;
  } = {},
): { status: number; body: AiHttpErrorBody; retryAfterSeconds: number | null } {
  if (isAiError(e)) {
    const retryAfterSeconds =
      e.retryAfterMs && (e.kind === "rate_limited" || e.kind === "overloaded")
        ? Math.max(1, Math.ceil(e.retryAfterMs / 1000))
        : null;
    return {
      status: e.httpStatus,
      body: { error: opts.messages?.[e.kind] ?? e.userMessage, code: e.kind },
      retryAfterSeconds,
    };
  }
  // Older plain Errors that say so (e.g. "X_API_KEY is not configured.").
  if (e instanceof Error && /\bnot configured\b/i.test(e.message)) {
    return {
      status: AI_ERROR_HTTP_STATUS.not_configured,
      body: {
        error: opts.messages?.not_configured ?? AI_ERROR_MESSAGES.not_configured,
        code: "not_configured",
      },
      retryAfterSeconds: null,
    };
  }
  return {
    status: 502,
    body: {
      error:
        opts.fallbackMessage ?? "Something went wrong with the AI. Please try again.",
      code: "unknown",
    },
    retryAfterSeconds: null,
  };
}

/** One-line server-side description of any error, for console / monitor. */
export function describeAiError(e: unknown): string {
  if (isAiError(e)) {
    return [e.message, e.detail ? `— ${e.detail}` : ""].filter(Boolean).join(" ");
  }
  if (e instanceof Error) return clip(`${e.name}: ${e.message}`);
  return clip(String(e));
}
