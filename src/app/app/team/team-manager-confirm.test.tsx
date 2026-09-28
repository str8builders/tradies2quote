// The previous look's team page asks before leaving or removing someone too.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamConfirm, TeamData } from "./_lib/useTeam";

const state = vi.hoisted(() => ({ confirming: null as TeamConfirm | null, isOwner: true }));

vi.mock("./_lib/useTeam", () => ({
  useTeam: () => {
    const data: TeamData = {
      team: { id: "t1", name: "Bayside Builders" },
      isOwner: state.isOwner,
      active: true,
      plan: "crew",
      seats: 5,
      roster: {
        members: [
          { user_id: "u1", email: "mike@bayside.co.nz", owner: true },
          { user_id: "u2", email: "sam@bayside.co.nz", owner: false },
        ],
        invitations: [],
      },
    };
    const noop = () => {};
    return {
      code: "",
      setCode: noop,
      codeSent: false,
      data,
      error: "",
      busy: false,
      link: "",
      notice: "",
      invite: "",
      load: async () => {},
      act: async () => {},
      copyLink: async () => {},
      confirming: state.confirming,
      ask: noop,
      cancelAsk: noop,
      confirmAsk: async () => {},
    };
  },
}));

import { TeamManager } from "./TeamManager";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  state.confirming = null;
  state.isOwner = true;
});

describe("TeamManager (previous look) asks first", () => {
  it("leaving: the question, then Leave team or Stay in the team", () => {
    state.isOwner = false;
    expect(renderToStaticMarkup(<TeamManager />)).not.toContain('data-testid="team-leave-confirm"');
    state.confirming = { action: "leave" };
    const html = renderToStaticMarkup(<TeamManager />);
    expect(html).toContain('data-testid="team-leave-confirm"');
    expect(text(html)).toContain("Leave Bayside Builders? You'll lose the shared client list.");
    expect(html).toContain(">Stay in the team<");
  });

  it("removing: asked on that person's row", () => {
    expect(renderToStaticMarkup(<TeamManager />)).toContain(">Remove member<");
    state.confirming = { action: "remove", userId: "u2", email: "sam@bayside.co.nz" };
    const html = renderToStaticMarkup(<TeamManager />);
    expect(html).toContain('data-testid="team-remove-confirm"');
    expect(html).toContain(">Keep them<");
    expect(html).not.toContain(">Remove member<");
  });
});
