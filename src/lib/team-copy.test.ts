// The Team page in the iPhone app: no plan names, subscriptions or plan
// links (App Store 3.1.3(f)). The website's words stay exactly as they were.

import { describe, expect, it } from "vitest";
import { TEAM_OVER_LIMIT, TEAM_SHARING_OFF, teamMessageForApp, teamWords } from "./team-copy";

const MONEY = /subscri|\bplans?\b|upgrade|billing|price|\$|\bcrew\b|\bbuilder\b|\bsolo\b/i;

describe("teamWords", () => {
  it("the app's words never mention plans, subscriptions or upgrading, and hide the plan and its link", () => {
    const app = teamWords(true);
    expect(app.showPlan).toBe(false);
    for (const text of Object.values(app).filter((v): v is string => typeof v === "string")) {
      expect(text).not.toMatch(MONEY);
    }
    expect(app.sharingOff).toContain("Team sharing isn't switched on for this account.");
    expect(app.overLimit).toBe("Your team has more people than it has room for. Remove someone to restore shared access.");
  });

  it("the website keeps its words, plan and Manage plan link", () => {
    const web = teamWords(false);
    expect(web.showPlan).toBe(true);
    expect(web.intro).toBe(
      "One subscription. A shared address book. Each person signs in with their own account and manages their own quotes.",
    );
    expect(web.sharingOff).toBe(
      "Team sharing needs an active Crew or Builder subscription. Your personal quotes remain in your own account.",
    );
    expect(web.ownerManages).toBe("Your team owner manages membership and billing.");
    expect(web.overLimit).toBe("Your team exceeds this plan’s seat limit. Remove members or upgrade to restore shared access.");
    expect(web.noTeamHeading).toBe("Make room for your crew");
  });
});

describe("teamMessageForApp (the team rules' refusals, in the app)", () => {
  it("plan and subscription refusals become plain words", () => {
    expect(teamMessageForApp("An active Crew or Builder plan is required.")).toBe(TEAM_SHARING_OFF);
    expect(teamMessageForApp("A team plan is required.")).toBe(TEAM_SHARING_OFF);
    for (const message of [
      "Your account already has a subscription. Finish or cancel it before joining a team.",
      "A personal checkout is still open. Join after it expires to avoid overlapping subscriptions.",
    ]) {
      const plain = teamMessageForApp(message);
      expect(plain).not.toMatch(MONEY);
      expect(plain).toMatch(/can't join a team/);
    }
  });

  it("everything else passes through", () => {
    for (const message of [
      "This person is already on your team.",
      "All seats are in use or reserved by invitations.",
      "The verification code is incorrect.",
    ]) {
      expect(teamMessageForApp(message)).toBe(message);
    }
    expect(TEAM_OVER_LIMIT).not.toMatch(MONEY);
  });
});
