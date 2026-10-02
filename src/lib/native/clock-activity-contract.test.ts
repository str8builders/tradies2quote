// The clock-in Live Activity across the page and the iPhone project. Swift
// can't run here, so these read the sources: every method the page calls
// exists natively, the widget extension is wired into the app, and the
// promises the feature makes (nothing about the client on the Lock Screen,
// safe on older iPhones, the link opens one page) stay in place.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHORTCUT_PATHS } from "./shortcuts";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const plugin = read("ios/App/App/T2QClockActivityPlugin.swift");
const attributes = read("ios/App/Shared/T2QClockActivityAttributes.swift");
const widget = read("ios/App/T2QWidgets/T2QClockLiveActivity.swift");
const widgetBundle = read("ios/App/T2QWidgets/T2QWidgetsBundle.swift");
const widgetPlist = read("ios/App/T2QWidgets/Info.plist");
const appPlist = read("ios/App/App/Info.plist");
const shortcuts = read("ios/App/App/T2QShortcutsPlugin.swift");
const delegate = read("ios/App/App/AppDelegate.swift");
const main = read("ios/App/App/MainViewController.swift");
const location = read("ios/App/App/T2QLocationPlugin.swift");
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const js = read("src/lib/native/clock-activity.ts");
const bridge = read("src/app/app/_v2/shell/LocationBridge.tsx");

/** A Swift method body: from its signature to the next declaration at the same indent. */
function swiftFunc(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const ends = ["\n    func ", "\n    private func ", "\n    @objc func ", "\n    static func ", "\n    @available", "\n    // MARK:", "\n}"]
    .map((marker) => source.indexOf(marker, start + signature.length))
    .filter((i) => i > 0);
  return source.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe("the page's T2QClockActivity methods all exist in the app", () => {
  const block = js.slice(js.indexOf("interface T2QClockActivityPlugin {"), js.indexOf("const T2QClockActivity = registerPlugin"));
  const jsMethods = [...block.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
  const nativeMethods = [...plugin.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map((m) => m[1]);

  it("listed and implemented natively", () => {
    expect(jsMethods).toEqual(["status", "sync", "end"]);
    for (const name of jsMethods) {
      expect(nativeMethods, name).toContain(name);
      expect(plugin, name).toContain(`@objc func ${name}(_ call: CAPPluginCall)`);
    }
  });

  it("under the same JS name, registered with the web view", () => {
    expect(plugin).toContain('public let jsName = "T2QClockActivity"');
    expect(js).toContain('registerPlugin<T2QClockActivityPlugin>("T2QClockActivity")');
    expect(main).toContain("registerPluginInstance(T2QClockActivityPlugin())");
  });
});

describe("what the Lock Screen can see", () => {
  it("only when work started: no client, job or place", () => {
    const state = attributes.slice(attributes.indexOf("struct ContentState"), attributes.indexOf("/// The open time entry"));
    expect([...state.matchAll(/\bvar (\w+):/g)].map((m) => m[1])).toEqual(["startedAt"]);
    expect([...attributes.matchAll(/^\s*(?:var|let) (\w+):/gm)].map((m) => m[1]).sort()).toEqual(["entryId", "startedAt"]);
    expect(js).not.toMatch(/clientName|place/);
  });

  it("the timer is the system's own, so it counts with the app closed", () => {
    expect(widget).toMatch(/Text\(timerInterval: startedAt\.\.\.startedAt\.addingTimeInterval\(12 \* 60 \* 60\), pauseTime: nil, countsDown: false, showsHours: true\)/);
    const code = widget.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/style: \.timer\)/); // on a past date it came out as words on iOS 26
  });
});

describe("older iPhones", () => {
  it("every ActivityKit call sits behind iOS 16.2, and the deployment target stays 15", () => {
    for (const signature of ["func sync(entryId: String", "func end() async -> Int"]) {
      const body = swiftFunc(plugin, signature);
      expect(body, signature).toMatch(/guard #available\(iOS 16\.2, \*\) else/);
    }
    expect(plugin.indexOf("Activity.request")).toBeGreaterThan(plugin.indexOf("guard #available(iOS 16.2, *) else { return \"unsupported\" }"));
    expect(pbx.match(/IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/g)?.length).toBeGreaterThanOrEqual(2);
    expect(attributes).toContain("@available(iOS 16.1, *)");
  });
});

describe("an entry gets one activity", () => {
  it("starts it once per entry, so a dismissed one doesn't come back every time the app opens", () => {
    const body = swiftFunc(plugin, "func sync(entryId: String");
    expect(body).toContain("store.string(forKey: startedKey) == entryId");
    expect(body.indexOf("kept-off")).toBeLessThan(body.indexOf("Activity.request"));
    expect(body).toContain("store.set(entryId, forKey: startedKey)");
  });

  it("looks and starts in one uninterrupted step, so two syncs at once can't start two", () => {
    const body = swiftFunc(plugin, "func sync(entryId: String");
    expect(body).toContain("lock.lock()");
    expect(body).toContain("defer { lock.unlock() }");
    expect(body.indexOf("lock.lock()")).toBeLessThan(body.indexOf("Self.running()"));
    expect(body.indexOf("Self.running()")).toBeLessThan(body.indexOf("Activity.request"));
    expect(body.slice(0, body.indexOf("lock.lock()"))).not.toContain("await"); // no waiting between the checks and the lock
    // The slow calls (end, update) are tasks of their own, not waits inside it.
    const waits = body.split("\n").filter((line) => /\bawait\b/.test(line));
    expect(waits.length).toBeGreaterThan(0);
    for (const line of waits) expect(line, line).toContain("Task {");
  });

  it("ending forgets the entry under the same lock, then waits for the activities to go", () => {
    const body = swiftFunc(plugin, "func end() async -> Int");
    expect(body).toContain("lock.withLock");
    expect(body.indexOf("lock.withLock")).toBeLessThan(body.indexOf("await activity.end"));
  });

  it("another entry's activity is ended, and ending clears the memory", () => {
    expect(swiftFunc(plugin, "func sync(entryId: String")).toMatch(/attributes\.entryId == entryId[\s\S]*?dismissalPolicy: \.immediate/);
    expect(swiftFunc(plugin, "func end() async -> Int")).toContain("store.removeObject(forKey: startedKey)");
  });

  it("leaving a job site ends it at once, even with the app in the background", () => {
    const siteEvent = swiftFunc(location, "private func siteEvent(");
    expect(siteEvent).toMatch(/if type == "exit" \{ T2QClockActivityController\.shared\.endNow\(\) \}/);
  });

  it("the page starts it from the open entry on every read, and ends it on sign-out", () => {
    expect(bridge).toMatch(/if \(native\) void syncClockActivity\(next\.open\)/);
    expect(bridge).toMatch(/isSignOutAction\([\s\S]{0,300}?endClockActivity\(\)/);
  });
});

describe("the tap opens the Timesheet, and only that", () => {
  it("the widget links to t2q://timesheet, a scheme the app registers", () => {
    expect(widget).toContain('URL(string: "t2q://timesheet")');
    expect(appPlist).toMatch(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>t2q<\/string>\s*<\/array>/);
    expect(shortcuts).toContain('static let linkScheme = "t2q"');
  });

  it("the app maps that link to a page on the page's own list, and nothing else", () => {
    const table = shortcuts.slice(shortcuts.indexOf("static let linkPaths"), shortcuts.indexOf("}", shortcuts.indexOf("static let linkPaths")));
    const paths = [...table.matchAll(/"(\w+)": "(\/app\/[\w/-]+)"/g)];
    expect(paths.map((m) => m[1])).toEqual(["timesheet"]);
    for (const [, , path] of paths) expect(SHORTCUT_PATHS as readonly string[]).toContain(path);
    expect(delegate).toMatch(/if T2QShortcuts\.shared\.handle\(link: url\) \{ return true \}/);
  });
});

describe("the widget extension is part of the app", () => {
  it("the app declares Live Activities", () => {
    expect(appPlist).toMatch(/<key>NSSupportsLiveActivities<\/key>\s*<true\/>/);
  });

  it("is a WidgetKit extension that holds the clock Live Activity", () => {
    expect(widgetPlist).toContain("<string>com.apple.widgetkit-extension</string>");
    expect(widgetPlist).toContain("<string>XPC!</string>");
    expect(widgetBundle).toMatch(/@main\s+struct T2QWidgetsBundle: WidgetBundle/);
    expect(widgetBundle).toContain("T2QClockLiveActivity()");
  });

  it("is built with the app, embedded in it and signed under the app's own id", () => {
    expect(pbx).toMatch(/productType = "com\.apple\.product-type\.app-extension";/);
    expect(pbx).toMatch(/dstSubfolderSpec = 13;[\s\S]{0,200}T2QWidgets\.appex in Embed Foundation Extensions/);
    expect(pbx).toMatch(/dependencies = \(\s*T2QEXT0000000000000000008 \/\* PBXTargetDependency \*\/|dependencies = \(\s*\w+ \/\* PBXTargetDependency \*\/,\s*\);\s*name = App;/);
    const appId = pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = (com\.str8builders\.tradies2quote);/)?.[1];
    const extId = pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = (com\.str8builders\.tradies2quote\.\w+);/)?.[1];
    expect(appId).toBe("com.str8builders.tradies2quote");
    expect(extId?.startsWith(`${appId}.`)).toBe(true);
  });

  it("needs iOS 16.2 and keeps the app's version, as iOS requires of an extension", () => {
    /** Every build configuration block that sets this Info.plist. */
    const configs = (plist: string) => pbx.split("isa = XCBuildConfiguration;").filter((block) => block.includes(`INFOPLIST_FILE = ${plist};`));
    const extension = configs("T2QWidgets/Info.plist");
    const app = configs("App/Info.plist");
    expect(extension).toHaveLength(2); // Debug and Release
    expect(app).toHaveLength(2);
    for (const block of extension) {
      expect(block).toContain("IPHONEOS_DEPLOYMENT_TARGET = 16.2;");
      expect(block).toContain("SKIP_INSTALL = YES;");
    }
    for (const key of ["MARKETING_VERSION = 1.0;", "CURRENT_PROJECT_VERSION = 1;"]) {
      for (const block of [...extension, ...app]) expect(block, key).toContain(key);
    }
  });

  it("the shared attributes are compiled into both the app and the extension", () => {
    expect(pbx.match(/T2QClockActivityAttributes\.swift in Sources/g)).toHaveLength(4); // 2 build files, each named in its target's phase
    expect(pbx.match(/\/\* T2QClockActivityAttributes\.swift \*\/ = \{isa = PBXFileReference/g)).toHaveLength(1);
    expect(pbx.match(/\/\* T2QClockActivityPlugin\.swift in Sources \*\//g)).toHaveLength(2);
  });
});
