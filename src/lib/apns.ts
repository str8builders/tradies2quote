import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import http2 from "node:http2";

/**
 * Minimal APNs HTTP/2 sender for the iOS App Store shell.
 *
 * Zero new dependencies: provider-token auth (ES256 JWT signed with the
 * .p8 key via node:crypto using ieee-p1363 output — the JOSE r||s form)
 * and a short-lived http2 session per batch.
 *
 * Env (all absent until the Apple Developer account's key is created —
 * every function degrades to a silent no-op so the web deploy is safe):
 *   APNS_TEAM_ID      — 10-char Apple team id
 *   APNS_KEY_ID       — 10-char key id of the .p8
 *   APNS_PRIVATE_KEY  — the .p8 PEM (literal \n escapes allowed)
 *   APNS_TOPIC        — bundle id; defaults to com.str8builders.tradies2quote
 *   APNS_ENV          — "production" (default) | "sandbox"
 */

const APNS_TOPIC_DEFAULT = "com.str8builders.tradies2quote";
const TOKEN_TTL_MS = 45 * 60 * 1000; // Apple allows 20–60 min; refresh at 45.

let cachedJwt: { token: string; issuedAt: number } | null = null;

export function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_TEAM_ID &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_PRIVATE_KEY,
  );
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** ES256 provider JWT, cached until near Apple's 1h ceiling. */
function providerJwt(): string {
  const now = Date.now();
  if (cachedJwt && now - cachedJwt.issuedAt < TOKEN_TTL_MS) {
    return cachedJwt.token;
  }
  const teamId = process.env.APNS_TEAM_ID!;
  const keyId = process.env.APNS_KEY_ID!;
  const pem = process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(
    JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }),
  );
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey(pem);
  // ieee-p1363 = raw r||s signature — the JWS (JOSE) format. The default
  // DER output would be rejected by Apple.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${signingInput}.${b64url(signature)}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

export type ApnsResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };

/**
 * Send one alert push to one device token. Resolves (never rejects) with
 * a status the caller can use to prune dead tokens (410 / BadDeviceToken).
 */
export function sendApnsNotification(
  deviceToken: string,
  payload: { title: string; body: string; url?: string },
): Promise<ApnsResult> {
  if (!apnsConfigured()) {
    return Promise.resolve({ ok: false, status: 0, reason: "not_configured" });
  }
  const host =
    process.env.APNS_ENV === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";
  const topic = process.env.APNS_TOPIC || APNS_TOPIC_DEFAULT;

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    // Deep-link target the shell can read from the notification tap.
    ...(payload.url ? { url: payload.url } : {}),
  });

  return new Promise<ApnsResult>((resolve) => {
    let settled = false;
    const done = (r: ApnsResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    try {
      const client = http2.connect(host);
      client.on("error", (e) =>
        done({ ok: false, status: 0, reason: String(e) }),
      );
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${providerJwt()}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0;
      let respBody = "";
      req.setEncoding("utf8");
      req.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      req.on("data", (c: string) => {
        respBody += c;
      });
      req.on("end", () => {
        client.close();
        if (status === 200) return done({ ok: true });
        let reason = "unknown";
        try {
          reason = (JSON.parse(respBody) as { reason?: string }).reason ?? reason;
        } catch {
          /* keep unknown */
        }
        done({ ok: false, status, reason });
      });
      req.on("error", (e) => {
        client.close();
        done({ ok: false, status: 0, reason: String(e) });
      });
      req.end(body);
    } catch (e) {
      done({ ok: false, status: 0, reason: String(e) });
    }
  });
}
