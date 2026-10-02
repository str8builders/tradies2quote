"use client";

import { useSyncExternalStore } from "react";
import { hasNativeModule, type NativeModule } from "./plugins";

const noSubscribe = () => () => {};

/**
 * Whether this device has the native module, safe to render with: the server
 * and the first browser render both say no (so they agree), then a phone with
 * the module says yes.
 */
export function useHasNativeModule(name: NativeModule): boolean {
  return useSyncExternalStore(noSubscribe, () => hasNativeModule(name), () => false);
}
