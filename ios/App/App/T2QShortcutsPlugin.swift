import Capacitor
import UIKit

/// Home Screen quick actions: press and hold the app icon for New quote,
/// Timesheet, Jobs and Scan a supplier quote. iOS hands the chosen action to
/// the app delegate (cold start or already open); the page collects it with
/// `consume()` (JS name "T2QShortcuts"), or is nudged by a "shortcut" event
/// when the app was already open.
///
/// The actions are the static items in Info.plist. What each one opens is
/// decided HERE, from the item's type, never from anything the item carries,
/// and the page checks the path again before going there.
final class T2QShortcuts {
    static let shared = T2QShortcuts()

    /// Item type (Info.plist UIApplicationShortcutItemType) to the page it opens.
    static let paths: [String: String] = [
        "com.str8builders.tradies2quote.new-quote": "/app/quotes/new",
        "com.str8builders.tradies2quote.timesheet": "/app/timesheet",
        "com.str8builders.tradies2quote.jobs": "/app/jobs",
        "com.str8builders.tradies2quote.supplier-quote": "/app/materials/capture",
    ]

    /// An action waits this long for the page to ask for it (a stale one, say
    /// from a launch that stopped at the sign-in screen, is dropped).
    static let maxAge: TimeInterval = 60

    private var pending: (path: String, at: Date)?

    /// Told when an action arrives (the plugin tells the page).
    var onShortcut: (() -> Void)?

    /// Remember the chosen action. False when it isn't one of ours.
    @discardableResult
    func handle(_ item: UIApplicationShortcutItem) -> Bool {
        guard let path = Self.paths[item.type] else { return false }
        pending = (path, Date())
        DispatchQueue.main.async { self.onShortcut?() }
        return true
    }

    /// The page an action asked for, once, if it is still fresh.
    func consume(now: Date = Date()) -> String? {
        defer { pending = nil }
        guard let pending, now.timeIntervalSince(pending.at) < Self.maxAge else { return nil }
        return pending.path
    }
}

/// The page's way to the quick actions (JS name "T2QShortcuts").
@objc(T2QShortcutsPlugin)
public class T2QShortcutsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T2QShortcutsPlugin"
    public let jsName = "T2QShortcuts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "consume", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        DispatchQueue.main.async {
            T2QShortcuts.shared.onShortcut = { [weak self] in
                self?.notifyListeners("shortcut", data: [:], retainUntilConsumed: true)
            }
        }
    }

    /// `{ path }` for the action waiting, or `{}` when there is none.
    @objc func consume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let path = T2QShortcuts.shared.consume() {
                call.resolve(["path": path])
            } else {
                call.resolve([:])
            }
        }
    }
}
