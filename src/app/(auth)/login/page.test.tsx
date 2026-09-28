import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => true }));

import LoginPage from "./page";
import { LoginForm } from "./_components/LoginForm";
import { NativeTrackingStop } from "@/app/_components/NativeTrackingStop";

function findAll(node: unknown, type: unknown): ReactElement[] {
  const found: ReactElement[] = [];
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

describe("/login", () => {
  it("stops the iPhone app's location tracking whenever someone lands on sign-in", async () => {
    const tree = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(findAll(tree, LoginForm)).toHaveLength(1);
    expect(findAll(tree, NativeTrackingStop)).toHaveLength(1);
  });
});
