import { describe, expect, it } from "vitest";
import { isPushServiceEndpoint } from "./push-endpoint";

/** Audit 2026-09-15: the server POSTs to stored endpoints, so only browser push services are accepted. */
describe("push endpoint allow-list", () => {
  it("accepts the browsers' push services over https", () => {
    expect(isPushServiceEndpoint("https://fcm.googleapis.com/fcm/send/abc:APA91b")).toBe(true);
    expect(isPushServiceEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAAA")).toBe(true);
    expect(isPushServiceEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isPushServiceEndpoint("https://web.push.apple.com/QGxyz")).toBe(true);
  });
  it("rejects anything the server must not be made to call", () => {
    expect(isPushServiceEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushServiceEndpoint("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isPushServiceEndpoint("https://evil.example/collect")).toBe(false);
    expect(isPushServiceEndpoint("https://googleapis.com.evil.example/x")).toBe(false);
    expect(isPushServiceEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isPushServiceEndpoint("not a url")).toBe(false);
    expect(isPushServiceEndpoint(`https://fcm.googleapis.com/${"a".repeat(3000)}`)).toBe(false);
  });
});
