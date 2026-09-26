"use client";

import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeIOSApp } from "@/lib/native-app";

interface T2QChromePlugin {
  setStatusBar(options: { style: "light" | "dark" }): Promise<void>;
}

const T2QChrome = registerPlugin<T2QChromePlugin>("T2QChrome");

/** The clock's colour for a look: dark on outdoor mode's white, light otherwise. */
export function statusBarStyle(outdoor: boolean): "light" | "dark" {
  return outdoor ? "dark" : "light";
}

/**
 * The iPhone app's clock and battery (ios/App/App/MainViewController.swift).
 * The page draws right up under them, so they follow the look: light on the
 * dark look, dark on outdoor mode's white. Back to light when the new look
 * isn't on screen. Nothing happens in a browser.
 */
export function StatusBarTint({ outdoor }: { outdoor: boolean }) {
  useEffect(() => {
    if (!isNativeIOSApp() || !Capacitor.isPluginAvailable("T2QChrome")) return;
    void T2QChrome.setStatusBar({ style: statusBarStyle(outdoor) }).catch(() => {});
    return () => {
      void T2QChrome.setStatusBar({ style: "light" }).catch(() => {});
    };
  }, [outdoor]);
  return null;
}
