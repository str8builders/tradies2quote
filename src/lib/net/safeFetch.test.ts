import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSafeUrl, isPublicAddress, safeGetText, UnsafeUrlError, type SafeFetchOptions } from "./safeFetch";

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8", true], ["1.1.1.1", true], ["203.0.114.1", true], ["2606:4700:4700::1111", true],
    ["127.0.0.1", false], ["10.1.2.3", false], ["172.16.0.1", false], ["172.31.255.255", false],
    ["192.168.1.1", false], ["169.254.169.254", false], ["100.64.0.1", false], ["0.0.0.0", false],
    ["224.0.0.1", false], ["::1", false], ["::", false], ["fd00::1", false], ["fe80::1", false],
    ["::ffff:127.0.0.1", false], ["::ffff:8.8.8.8", true], ["not-an-ip", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

describe("assertSafeUrl", () => {
  it.each([
    "http://localhost/", "http://127.0.0.1:2019/config/", "http://[::1]/", "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/", "ftp://example.com/", "http://user:pw@example.com/",
    "https://example.com:8443/", "http://printer.local/", "http://db.internal/",
  ])("refuses %s", (url) => {
    expect(() => assertSafeUrl(new URL(url))).toThrow(UnsafeUrlError);
  });
  it("accepts a normal supplier link", () => {
    expect(() => assertSafeUrl(new URL("https://www.bunnings.co.nz/some-product_p123"))).not.toThrow();
  });
});

describe("safeGetText", () => {
  it("refuses loopback addresses before any request", async () => {
    await expect(safeGetText("http://127.0.0.1:2019/config/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeGetText("http://localhost/")).rejects.toThrow(UnsafeUrlError);
  });

  describe("against a local test server", () => {
    let server: http.Server;
    let port = 0;
    // Tests talk to 127.0.0.1, so they swap in a permissive lookup and a host
    // that assertSafeUrl accepts; the real code path is otherwise unchanged.
    const lookup: NonNullable<SafeFetchOptions["lookup"]> = (_host, options, cb) => {
      if (options.all) cb(null, [{ address: "127.0.0.1", family: 4 }]);
      else cb(null, "127.0.0.1", 4);
    };
    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (req.url === "/redirect-internal") {
          res.writeHead(302, { location: "http://127.0.0.1:2019/config/" });
          res.end();
          return;
        }
        if (req.url === "/redirect-ok") {
          res.writeHead(301, { location: "/page" });
          res.end();
          return;
        }
        if (req.url === "/big") {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("x".repeat(5000));
          return;
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<h1>Deck screws</h1>");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it("follows a same-site redirect and reads the page", async () => {
      const res = await safeGetText(`http://test.example:${port}/redirect-ok`, { lookup, allowPorts: [port] });
      expect(res.ok).toBe(true);
      expect(res.text).toContain("Deck screws");
    });

    it("blocks a redirect to an internal address", async () => {
      await expect(
        safeGetText(`http://test.example:${port}/redirect-internal`, { lookup, allowPorts: [port] }),
      ).rejects.toThrow(UnsafeUrlError);
    });

    it("caps the body size", async () => {
      const res = await safeGetText(`http://test.example:${port}/big`, { lookup, allowPorts: [port], maxBytes: 100 });
      expect(res.text.length).toBe(100);
    });

    it("keeps the default-port rule when no test ports are allowed", async () => {
      await expect(safeGetText(`http://test.example:${port}/page`, { lookup })).rejects.toThrow(UnsafeUrlError);
    });
  });
});
