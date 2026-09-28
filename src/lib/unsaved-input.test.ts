import { describe, expect, it } from "vitest";
import { hasUnsavedInput, holdUnsavedInput } from "./unsaved-input";

describe("pages holding input a reload would lose", () => {
  it("is held until every holder lets go", () => {
    expect(hasUnsavedInput()).toBe(false);
    const words = holdUnsavedInput("new quote words");
    const editor = holdUnsavedInput("job page editor");
    expect(hasUnsavedInput()).toBe(true);
    words();
    expect(hasUnsavedInput()).toBe(true);
    editor();
    expect(hasUnsavedInput()).toBe(false);
  });

  it("letting go twice doesn't free someone else's hold", () => {
    const first = holdUnsavedInput();
    const second = holdUnsavedInput();
    first();
    first();
    expect(hasUnsavedInput()).toBe(true);
    second();
    expect(hasUnsavedInput()).toBe(false);
  });
});
