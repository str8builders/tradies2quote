import { describe, expect, it } from "vitest";
import {
  buildErrorDigest,
  parseDiagnoses,
  summariseWindow,
  type DigestGroup,
  type GroupRow,
  type WindowEvent,
} from "../errors";

const SINCE = "2026-08-10T00:00:00.000Z";

function ev(overrides: Partial<WindowEvent> = {}): WindowEvent {
  return {
    group_id: "g1",
    fingerprint: "fp1",
    name: "Error",
    message: "boom",
    surface: "api",
    route: "/api/quotes/generate",
    occurred_at: "2026-08-10T06:00:00.000Z",
    ...overrides,
  };
}

function group(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    id: "g1",
    fingerprint: "fp1",
    title: "Error: boom",
    surface: "api",
    route: "/api/quotes/generate",
    event_count: 40,
    first_seen_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-08-10T06:00:00.000Z",
    resolved_at: null,
    ...overrides,
  };
}

describe("summariseWindow", () => {
  it("counts window events per group and ranks most-hit first", () => {
    const events = [
      ev(),
      ev(),
      ev(),
      ev({ group_id: "g2", fingerprint: "fp2" }),
    ];
    const groups = [
      group(),
      group({ id: "g2", fingerprint: "fp2", title: "Other", event_count: 5 }),
    ];
    const out = summariseWindow(events, groups, SINCE);
    expect(out.totalEvents).toBe(4);
    expect(out.groups.map((g) => g.fingerprint)).toEqual(["fp1", "fp2"]);
    expect(out.groups[0].windowCount).toBe(3);
    expect(out.groups[0].lifetimeCount).toBe(40);
  });

  it("marks a group NEW when it was first seen inside the window", () => {
    const out = summariseWindow(
      [ev()],
      [group({ first_seen_at: "2026-08-10T05:00:00.000Z" })],
      SINCE,
    );
    expect(out.groups[0].isNew).toBe(true);
  });

  it("marks a previously-resolved group as resurfaced", () => {
    const out = summariseWindow(
      [ev()],
      [group({ resolved_at: "2026-08-01T00:00:00.000Z" })],
      SINCE,
    );
    expect(out.groups[0].resurfaced).toBe(true);
  });

  it("survives an event with no matching group row", () => {
    const out = summariseWindow(
      [ev({ group_id: null, fingerprint: "orphan", name: "TypeError", message: "x" })],
      [],
      SINCE,
    );
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].isNew).toBe(true);
    expect(out.groups[0].title).toContain("TypeError");
  });
});

describe("parseDiagnoses", () => {
  const good =
    '[{"fingerprint":"fp1","likely_cause":"stale build","severity":"high","next_step":"redeploy"}]';

  it("parses a plain JSON array", () => {
    const out = parseDiagnoses(good);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("high");
  });

  it("tolerates a code fence and surrounding prose", () => {
    const out = parseDiagnoses("Here you go:\n```json\n" + good + "\n```");
    expect(out).toHaveLength(1);
  });

  it("drops malformed entries and never throws", () => {
    expect(parseDiagnoses("not json at all")).toEqual([]);
    expect(parseDiagnoses('[{"fingerprint":"fp1"}]')).toEqual([]);
    const mixed = parseDiagnoses(
      '[{"fingerprint":"fp1","likely_cause":"a","severity":"weird","next_step":"b"}]',
    );
    expect(mixed[0].severity).toBe("medium");
  });
});

describe("buildErrorDigest", () => {
  const g: DigestGroup = {
    fingerprint: "fp1",
    title: "Error: boom",
    surface: "client",
    route: "/t2qcal",
    windowCount: 3,
    lifetimeCount: 40,
    isNew: true,
    resurfaced: false,
    firstSeenAt: SINCE,
    lastSeenAt: SINCE,
  };

  it("writes the counts into the subject", () => {
    const out = buildErrorDigest({
      windowDays: 1,
      totalEvents: 3,
      groups: [g],
      diagnoses: [],
    });
    expect(out.subject).toBe(
      "T2Q errors — 3 events across 1 problem in the last 24h (1 new)",
    );
  });

  it("renders the diagnosis under its group in text and html", () => {
    const out = buildErrorDigest({
      windowDays: 1,
      totalEvents: 3,
      groups: [g],
      diagnoses: [
        {
          fingerprint: "fp1",
          likelyCause: "crash in the calculator app",
          severity: "high",
          nextStep: "read the stack in the monitor",
        },
      ],
    });
    expect(out.text).toContain("likely cause (high): crash in the calculator app");
    expect(out.text).toContain("next step: read the stack in the monitor");
    expect(out.html).toContain("crash in the calculator app");
  });

  it("labels surfaces in words and escapes html", () => {
    const out = buildErrorDigest({
      windowDays: 1,
      totalEvents: 1,
      groups: [{ ...g, title: "<script>", windowCount: 1 }],
      diagnoses: [],
    });
    expect(out.text).toContain("app/browser");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).not.toContain("<script>");
  });

  it("caps the list at ten and says how many more there are", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      ...g,
      fingerprint: `fp${i}`,
      title: `Problem ${i}`,
    }));
    const out = buildErrorDigest({
      windowDays: 1,
      totalEvents: 13,
      groups: many,
      diagnoses: [],
    });
    expect(out.text).toContain("…and 3 more");
  });
});
