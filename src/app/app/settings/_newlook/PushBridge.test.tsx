// PushBridge does all of its work in a useEffect, which renderToStaticMarkup
// (this repo's node-only render pattern — see render.test.tsx) never runs;
// the underlying logic is unit-tested directly in push.test.ts. This just
// locks in that the component renders nothing and never throws, on the web
// (isNativeIOSApp false) where it must remain fully inert.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

import { PushBridge } from "./PushBridge";

describe("PushBridge", () => {
  it("renders nothing", () => {
    expect(renderToStaticMarkup(<PushBridge />)).toBe("");
  });
});
