// The quick-action bridge does its work in an effect (never run by renderToStaticMarkup), and the logic is tested in
// src/lib/native/native.test.ts. This locks in that it draws nothing, and that the app shell mounts it.

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

import { NativeShortcutsBridge } from "./NativeShortcutsBridge";

describe("NativeShortcutsBridge", () => {
  it("renders nothing", () => {
    expect(renderToStaticMarkup(<NativeShortcutsBridge />)).toBe("");
  });

  it("is mounted in the app shell, beside the push and location bridges", () => {
    const source = readFileSync(`${process.cwd()}/src/app/app/_v2/shell/NewLookShell.tsx`, "utf8");
    expect(source).toMatch(/^\s*<NativeShortcutsBridge \/>/m);
  });
});
