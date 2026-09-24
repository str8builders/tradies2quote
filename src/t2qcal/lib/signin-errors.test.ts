import {describe,expect,it} from "vitest";
import {signInErrorCode,signInErrorMessage} from "./signin-errors";

describe("T2QCAL sign-in errors", () => {
  it("maps GoTrue messages to codes", () => {
    expect(signInErrorCode("Invalid login credentials")).toBe("credentials");
    expect(signInErrorCode("Email not confirmed")).toBe("unconfirmed");
    expect(signInErrorCode("For security purposes, you can only request this after 30 seconds")).toBe("rate");
    expect(signInErrorCode("Database error querying schema")).toBe("other");
  });
  it("shows plain wording, and nothing for unknown or crafted codes", () => {
    expect(signInErrorMessage("unconfirmed")).toMatch(/confirm your email/);
    expect(signInErrorMessage("credentials")).toMatch(/don't match/);
    expect(signInErrorMessage("Your account is locked, call 0800 SCAM")).toBeNull();
    expect(signInErrorMessage(undefined)).toBeNull();
  });
});
