import "server-only";
import { AppStoreServerAPIClient, Environment } from "@apple/app-store-server-library";
import fetch from "node-fetch";
import type { URLSearchParams } from "node:url";

/** Preserve Apple's signing/validation, while bounding header AND body reads. */
export class BoundedAppleClient extends AppStoreServerAPIClient {
  private readonly origin: string;
  constructor(key: string, keyID: string, issuer: string, bundle: string, environment: Environment) {
    if (environment !== Environment.PRODUCTION && environment !== Environment.SANDBOX) throw new Error("Unsupported Apple service environment");
    super(key, keyID, issuer, bundle, environment);
    this.origin = environment === Environment.PRODUCTION ? "https://api.storekit.apple.com" : "https://api.storekit-sandbox.apple.com";
  }
  protected override async makeFetchRequest(path: string, query: URLSearchParams, method: string, body: string | Buffer | undefined, headers: Record<string, string>) {
    return fetch(`${this.origin}${path}?${query}`, { method, body, headers, redirect: "error", size: 2_000_000, signal: AbortSignal.timeout(20_000) });
  }
}
