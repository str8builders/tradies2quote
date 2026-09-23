import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

/**
 * Fetch a user-supplied web page without letting it reach the server's own
 * network (SSRF). Used by the supplier product lookup, which fetches whatever
 * link a tradie pastes.
 *
 * - http(s) only, default ports only, no credentials in the URL.
 * - Hostnames like localhost / *.local / *.internal are refused.
 * - Every address the name resolves to must be public (no loopback, private,
 *   link-local, CGNAT, multicast, reserved, ULA or IPv4-mapped private IPv6).
 *   The check runs inside the socket's own DNS lookup, so the connection is
 *   pinned to the address that was checked (no DNS-rebinding window).
 * - Redirects are followed by hand (max 3) and each hop is checked again.
 * - Body is capped; gzip/deflate/br are decoded.
 */
export class UnsafeUrlError extends Error {
  constructor(message = "That link can't be opened.") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOST = /^(localhost|localhost\.localdomain)$|\.(localhost|local|internal|intranet|lan|home\.arpa)$/i;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}
function inV4(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const PRIVATE_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16",
  "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
];

/** True only for globally routable unicast addresses. */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !PRIVATE_V4.some((cidr) => inV4(ip, cidr));
  if (family !== 6) return false;
  const lower = ip.toLowerCase();
  // IPv4-mapped / -compatible IPv6 (::ffff:a.b.c.d or ::a.b.c.d): judge the IPv4 part.
  const mapped = lower.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  if (lower === "::" || lower === "::1") return false;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (lower.startsWith("2001:db8") || lower.startsWith("64:ff9b:") || lower.startsWith("100::")) return false;
  return true;
}

/** Throws UnsafeUrlError unless the URL is an acceptable public http(s) address. */
export function assertSafeUrl(url: URL, allowPorts: readonly number[] = [80, 443]): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http(s) links are supported.");
  if (url.username || url.password) throw new UnsafeUrlError();
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!allowPorts.includes(port)) throw new UnsafeUrlError();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || BLOCKED_HOST.test(host)) throw new UnsafeUrlError();
  if (net.isIP(host) && !isPublicAddress(host)) throw new UnsafeUrlError();
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** DNS lookup used by the socket itself: refuses any non-public answer. */
export function publicOnlyLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new UnsafeUrlError() as NodeJS.ErrnoException, "", 4);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export interface SafeTextResponse {
  ok: boolean;
  status: number;
  url: string;
  text: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Tests only: replace the public-only DNS lookup. */
  lookup?: typeof publicOnlyLookup;
  /** Tests only: extra ports to allow (production allows 80 and 443). */
  allowPorts?: readonly number[];
}

type ResolvedOptions = Required<Omit<SafeFetchOptions, "lookup" | "allowPorts">> & {
  lookup: typeof publicOnlyLookup;
  allowPorts: readonly number[];
};

function requestOnce(url: URL, opts: ResolvedOptions, deadline: number) {
  return new Promise<{ status: number; location: string | null; text: string }>((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: { "accept-encoding": "gzip, deflate, br", ...opts.headers },
        lookup: opts.lookup as unknown as net.LookupFunction,
        timeout: Math.max(1, deadline - Date.now()),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location: res.headers.location ?? null, text: "" });
          return;
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - opts.maxBytes))));
            req.destroy();
            resolve({ status, location: null, text: Buffer.concat(chunks).toString("utf8") });
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, location: null, text: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { name: "AbortError" })));
    req.on("error", reject);
    req.end();
  });
}

/** GET a public web page as text, following up to `maxRedirects` checked redirects. */
export async function safeGetText(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeTextResponse> {
  const opts: ResolvedOptions = {
    timeoutMs: options.timeoutMs ?? 8_000,
    maxBytes: options.maxBytes ?? 1_000_000,
    maxRedirects: options.maxRedirects ?? 3,
    headers: options.headers ?? {},
    lookup: options.lookup ?? publicOnlyLookup,
    allowPorts: options.allowPorts ?? [80, 443],
  };
  const deadline = Date.now() + opts.timeoutMs;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Invalid link.");
  }
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    assertSafeUrl(url, opts.allowPorts);
    if (Date.now() >= deadline) throw Object.assign(new Error("timeout"), { name: "AbortError" });
    const res = await requestOnce(url, opts, deadline);
    if (res.location) {
      url = new URL(res.location, url);
      continue;
    }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, url: url.toString(), text: res.text };
  }
  throw new UnsafeUrlError("Too many redirects.");
}
