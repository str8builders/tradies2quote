import { describe, expect, it } from "vitest";
import { JOB_STAGES, nextRailPosition, railProgress, railStates } from "./job-stages";
import { nextSegmentIndex } from "./segments";
import {
  INITIAL_TOAST_STATE,
  TOAST_QUEUE_LIMIT,
  toastReducer,
  visibleToasts,
  type ToastAction,
  type ToastState,
} from "./toast-queue";

describe("status rail states", () => {
  it("has the six job steps in order", () => {
    expect(JOB_STAGES).toEqual(["Quote", "Sent", "Accepted", "Booked", "Done", "Paid"]);
  });

  it("marks earlier steps done, the waiting step current, later steps upcoming", () => {
    expect(railStates("Booked").map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
    expect(railStates("Quote").map((s) => s.state)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("a paid job is all done with nothing current", () => {
    expect(railStates("complete").every((s) => s.state === "done")).toBe(true);
    expect(railStates("Paid").at(-1)?.state).toBe("current");
  });

  it("fills the line up to the current dot, fully once complete", () => {
    expect(railProgress("Quote")).toBe(0);
    expect(railProgress("Booked")).toBeCloseTo(0.6);
    expect(railProgress("Paid")).toBe(1);
    expect(railProgress("complete")).toBe(1);
  });

  it("advances one step at a time and stops at complete", () => {
    expect(nextRailPosition("Accepted")).toBe("Booked");
    expect(nextRailPosition("Paid")).toBe("complete");
    expect(nextRailPosition("complete")).toBe("complete");
  });
});

describe("segmented control keys", () => {
  it("arrows move and wrap, Home/End jump, other keys do nothing", () => {
    expect(nextSegmentIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextSegmentIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextSegmentIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextSegmentIndex(1, "ArrowDown", 3)).toBe(2);
    expect(nextSegmentIndex(1, "ArrowUp", 3)).toBe(0);
    expect(nextSegmentIndex(1, "Home", 3)).toBe(0);
    expect(nextSegmentIndex(1, "End", 3)).toBe(2);
    expect(nextSegmentIndex(1, "Enter", 3)).toBeNull();
    expect(nextSegmentIndex(0, "ArrowRight", 0)).toBeNull();
  });
});

describe("toast queue", () => {
  const run = (actions: ToastAction[], start: ToastState = INITIAL_TOAST_STATE) =>
    actions.reduce(toastReducer, start);

  it("shows one toast at a time, in the order they were raised", () => {
    const state = run([
      { type: "push", message: "Booked for Tue 30 Sep" },
      { type: "push", message: "Invoice sent", tone: "info" },
    ]);
    expect(visibleToasts(state).map((t) => t.message)).toEqual(["Booked for Tue 30 Sep"]);
    const next = toastReducer(state, { type: "dismiss", id: state.items[0].id });
    expect(visibleToasts(next).map((t) => t.message)).toEqual(["Invoice sent"]);
  });

  it("can show more than one when asked", () => {
    const state = run([
      { type: "push", message: "One" },
      { type: "push", message: "Two" },
      { type: "push", message: "Three" },
    ]);
    expect(visibleToasts(state, 2).map((t) => t.message)).toEqual(["One", "Two"]);
  });

  it("gives ids in order and problems a longer time on screen", () => {
    const state = run([
      { type: "push", message: "Saved" },
      { type: "push", message: "Couldn't send", tone: "bad" },
      { type: "push", message: "Custom", duration: 1500 },
    ]);
    expect(state.items.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(state.items.map((t) => t.duration)).toEqual([4000, 6000, 1500]);
    expect(state.items[0].tone).toBe("ok");
  });

  it("does not repeat a message that is already queued, or an empty one", () => {
    const state = run([
      { type: "push", message: "Saved" },
      { type: "push", message: "Saved " },
      { type: "push", message: "   " },
    ]);
    expect(state.items).toHaveLength(1);
  });

  it("keeps the queue short, never dropping the toast on screen", () => {
    const actions: ToastAction[] = Array.from({ length: 7 }, (_, i) => ({
      type: "push",
      message: `Toast ${i + 1}`,
    }));
    const state = run(actions);
    expect(state.items).toHaveLength(TOAST_QUEUE_LIMIT);
    expect(state.items.map((t) => t.message)).toEqual(["Toast 1", "Toast 5", "Toast 6", "Toast 7"]);
  });

  it("dismissing an unknown id or clearing an empty queue changes nothing", () => {
    const state = run([{ type: "push", message: "Saved" }]);
    expect(toastReducer(state, { type: "dismiss", id: 99 })).toBe(state);
    expect(toastReducer(INITIAL_TOAST_STATE, { type: "clear" })).toBe(INITIAL_TOAST_STATE);
    expect(toastReducer(state, { type: "clear" }).items).toEqual([]);
  });
});
