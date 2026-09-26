// Your team (/app/team): the new-look switch, the new cards rendered to
// static HTML in node for each kind of team member, the App Store wording
// kept (no plan names in the iPhone app, 3.1.3(f)), and the old page still
// rendering as before.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ on: false, native: false, user: { id: "user-1" } as { id: string } | null }));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => env.native }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: env.user } }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));

import TeamPage from "../page";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { Screen } from "@/components/ui/screen";
import { teamWords } from "@/lib/team-copy";
import { TeamManager } from "../TeamManager";
import type { TeamData, TeamState } from "../_lib/useTeam";
import { TeamCards, TeamView, rosterSummary } from "./TeamCards";

const MONEY = /subscri|\bplans?\b|upgrade|billing|\$\d|free trial|7-day|no card|\bcrew\b|\bbuilder\b/i;
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

function findAll(node: unknown, type: unknown): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.type === type) found.push(element);
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

const OWNER: TeamData = {
  team: { id: "t1", name: "Bayside Builders" },
  isOwner: true,
  active: true,
  plan: "builder",
  seats: 2,
  roster: {
    members: [
      { user_id: "u1", email: "mike@bayside.co.nz", owner: true },
      { user_id: "u2", email: "sam@bayside.co.nz", owner: false },
      { user_id: "u3", email: "jo@bayside.co.nz", owner: false },
    ],
    invitations: [{ id: "i1", email: "new@bayside.co.nz", expires_at: "2026-10-04T00:00:00Z" }],
  },
};

/** The opening tag of the element holding a fragment (React orders some attributes itself). */
const tagWith = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const noop = () => {};
function team(over: Partial<TeamState> = {}): TeamState {
  return {
    code: "",
    setCode: noop,
    codeSent: false,
    data: OWNER,
    error: "",
    busy: false,
    link: "",
    notice: "",
    invite: "",
    load: async () => {},
    act: async () => {},
    copyLink: async () => {},
    ...over,
  };
}
const view = (over: Partial<TeamState> = {}, inApp = false) =>
  renderToStaticMarkup(<TeamView team={team(over)} words={teamWords(inApp)} />);

beforeEach(() => {
  env.on = false;
  env.native = false;
  env.user = { id: "user-1" };
});

describe("/app/team switch", () => {
  it("off: the old page and manager, unchanged", async () => {
    const tree = (await TeamPage({ searchParams: Promise.resolve({}) })) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, TeamManager)).toHaveLength(1);
    expect(findAll(tree, TeamCards)).toHaveLength(0);
    expect(renderToStaticMarkup(tree)).toContain("// better together");
  });

  it("on: the cards under the shared top bar, with the invitation and app flag passed on", async () => {
    env.on = true;
    env.native = true;
    const tree = (await TeamPage({ searchParams: Promise.resolve({ invite: "tok" }) })) as ReactElement;
    expect(tree.type).toBe(Screen);
    expect(findAll(tree, AppHeader).map((el) => el.props.context)).toEqual(["Your team"]);
    expect(findAll(tree, TeamCards).map((el) => el.props)).toEqual([{ initialInvite: "tok", inApp: true }]);
    const out = text(renderToStaticMarkup(tree));
    expect(out).toContain(teamWords(true).intro);
    expect(out).not.toMatch(MONEY);
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(TeamPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /login");
    env.on = true;
    await expect(TeamPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("TeamView (new look)", () => {
  it("the owner: people, invitations and every action", () => {
    const html = view();
    expect(html).toContain("Bayside Builders");
    expect(html).toContain(rosterSummary(OWNER));
    expect(html).toContain("3 members · 1 pending · 2 seats, including you");
    expect(html).toContain("mike@bayside.co.nz");
    expect(html).toContain(">Owner<");
    expect(html.match(/>Remove member</g)).toHaveLength(2);
    expect(html).toContain(">Revoke invitation<");
    expect(html).toContain("Invitation expires");
    expect(html).toContain(">Create invitation link<");
    const email = tagWith(html, 'name="email"');
    for (const attr of ['type="email"', 'maxLength="254"', "required"]) expect(email).toContain(attr);
    expect(html).toContain('href="/app/clients"');
    expect(html).toContain('href="/app/templates"');
  });

  it("over the seat limit: a warning in the right words for each place", () => {
    expect(view()).toContain(teamWords(false).overLimit);
    expect(text(view({}, true))).toContain(teamWords(true).overLimit);
  });

  it("the website names the plan and links to it; the iPhone app doesn't (3.1.3(f))", () => {
    const web = view();
    expect(web).toContain("Builder plan");
    expect(web).toContain('href="/app/upgrade"');
    const app = view({}, true);
    expect(app).not.toContain('href="/app/upgrade"');
    expect(text(app)).not.toMatch(/\bplans?\b|upgrade|subscri/i);
  });

  it("a member who isn't the owner can leave", () => {
    const html = view({ data: { ...OWNER, isOwner: false } });
    expect(html).toContain(teamWords(false).ownerManages);
    expect(html).toContain(">Leave team<");
    expect(html).not.toContain(">Remove member<");
  });

  it("no team yet: make one", () => {
    const html = view({ data: { ...OWNER, team: null, plan: "crew", roster: { members: [], invitations: [] } } });
    expect(html).toContain(teamWords(false).noTeamHeading);
    const name = tagWith(html, 'name="name"');
    for (const attr of ['maxLength="100"', "required"]) expect(name).toContain(attr);
    expect(html).toContain(">Create team<");
    expect(html).not.toContain('href="/app/templates"');
  });

  it("sharing off: says so in the app's words there", () => {
    const html = text(view({ data: { ...OWNER, team: null, active: false } }, true));
    expect(html).toContain(teamWords(true).sharingOff);
    expect(html).not.toMatch(MONEY);
  });

  it("an invitation: verify by email code, then join", () => {
    const first = view({ invite: "tok", data: null });
    expect(first).toContain("You have a team invitation");
    expect(first).toContain(">Email me a verification code<");
    expect(first).toContain("Loading your team…");
    const second = view({ invite: "tok", codeSent: true, data: null });
    expect(second).toContain(">Resend email code<");
    expect(second).toMatch(/<input[^>]*autoComplete="one-time-code"[^>]*>/);
    expect(second).toContain(">Verify and join team<");
  });

  it("a made link can be copied; errors and notices are announced", () => {
    const html = view({ link: "https://t2q.example/app/team?invite=abc", error: "Please try again.", notice: "Changes saved." });
    expect(html).toContain('value="https://t2q.example/app/team?invite=abc"');
    expect(html).toContain(">Copy link<");
    expect(html).toMatch(/role="alert"[\s\S]*Please try again\./);
    expect(html).toMatch(/role="status"[\s\S]*Changes saved\./);
  });

  it("a failed load offers another go", () => {
    expect(view({ data: null, error: "Unable to load your team." })).toContain(">Retry loading team<");
  });

  it("uses the new look only", () => {
    expect(view()).not.toMatch(/t2q-|font-mono|uppercase|bg-ink-|text-white|\/\/ /);
  });
});

describe("the old manager is unchanged", () => {
  it("still renders its loading line and invitation card", () => {
    const html = renderToStaticMarkup(<TeamManager initialInvite="tok" />);
    expect(html).toContain("t2q-card-pro");
    expect(html).toContain("You have a team invitation");
    expect(html).toContain("Loading your team…");
  });
});
