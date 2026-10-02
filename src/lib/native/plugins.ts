/**
 * Tradies2Quote's own native modules in the iPhone app (browser code).
 *
 * Each module is a small Swift plugin in ios/App/App, registered with the
 * app's web view under a JS name. They exist only in the iPhone app and only
 * from the build that added them, so every use asks first: in Safari, an
 * installed web app, or an older copy of the app, the answer is no and the
 * page does what it always did.
 */

import { Capacitor } from "@capacitor/core";
import { isNativeIOSApp } from "@/lib/native-app";

export type NativeModule = "T2QShortcuts" | "T2QCalendar" | "T2QContacts" | "T2QHaptics";

/** Inside the iPhone app, and this build has `name`. */
export function hasNativeModule(name: NativeModule): boolean {
  return isNativeIOSApp() && Capacitor.isPluginAvailable(name);
}
