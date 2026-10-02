import ActivityKit
import Capacitor
import Foundation

/// Starts, updates and ends the clock-in Live Activity: "Clocked in" with a
/// timer, in the Dynamic Island and on the Lock Screen (T2QWidgets draws it;
/// T2QClockActivityAttributes.swift is shared with it).
///
/// The page owns the truth (an open time entry on the account) and tells this
/// what it is each time it reads it (`sync`): an open entry gets an activity,
/// no open entry ends it. Everything is local: no push, no server, nothing
/// leaves the phone. The activity carries only the start time, never a client
/// or job name (the Lock Screen is readable by anyone).
///
/// Two limits of iOS shape it:
/// - An activity can only be STARTED while the app is open. An automatic
///   clock-in that happened with the app closed shows on the island the next
///   time the app is opened (the timer still counts from the real start).
/// - It can be ENDED any time the app runs, so leaving a job site ends it at
///   once (T2QLocationEngine calls `endNow`), and the system ends any activity
///   after 8 hours.
///
/// An entry gets at most one activity. Dismiss it from the Lock Screen, or let
/// iOS end it, and it stays gone for that shift rather than coming back every
/// time the app opens.
final class T2QClockActivityController {
    static let shared = T2QClockActivityController()

    private let store = UserDefaults.standard
    private let startedKey = "t2q.clockActivity.startedEntry"
    /// `sync` decides in one uninterrupted step (look, then start), so two
    /// calls arriving together (the page reads its state twice at once) can't
    /// both see "none running" and start two. The slow parts (ending, updating)
    /// run as their own tasks, outside it.
    private let lock = NSLock()

    /// iOS 16.2 or later.
    var supported: Bool {
        if #available(iOS 16.2, *) { return true }
        return false
    }

    /// Supported, and Live Activities are allowed for the app in Settings.
    var enabled: Bool {
        if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
        return false
    }

    /// How many clock-in activities are running (there should be 0 or 1).
    var count: Int {
        if #available(iOS 16.2, *) { return Self.running().count }
        return 0
    }

    var active: Bool { count > 0 }

    /// Make the activity match the open entry. Returns what it did:
    /// "started", "running" (already there, up to date), "updated", "kept-off"
    /// (this entry had one that was dismissed or ended: not again), "off"
    /// (Live Activities are off in Settings), "failed" (iOS refused, say the app
    /// wasn't open: it is tried again next time) or "unsupported".
    func sync(entryId: String, startedAt: Date) -> String {
        guard #available(iOS 16.2, *) else { return "unsupported" }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return "off" }
        lock.lock()
        defer { lock.unlock() }
        let state = T2QClockActivityAttributes.ContentState(startedAt: startedAt)

        // Another entry's activity (yesterday's shift) is over.
        var current: Activity<T2QClockActivityAttributes>?
        for activity in Self.running() {
            if activity.attributes.entryId == entryId, current == nil {
                current = activity
            } else {
                Task { await activity.end(nil, dismissalPolicy: .immediate) }
            }
        }

        if let current {
            if current.content.state == state { return "running" }
            Task { await current.update(ActivityContent(state: state, staleDate: nil)) }
            return "updated"
        }

        if store.string(forKey: startedKey) == entryId { return "kept-off" }
        do {
            _ = try Activity.request(
                attributes: T2QClockActivityAttributes(entryId: entryId),
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            store.set(entryId, forKey: startedKey)
            return "started"
        } catch {
            return "failed"
        }
    }

    /// End every clock-in activity. Returns how many were ended.
    @discardableResult
    func end() async -> Int {
        guard #available(iOS 16.2, *) else { return 0 }
        let running = lock.withLock { () -> [Activity<T2QClockActivityAttributes>] in
            store.removeObject(forKey: startedKey)
            return Self.running()
        }
        for activity in running {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return running.count
    }

    /// For callers that can't wait (leaving a job site, in the background).
    func endNow() {
        guard supported else { return }
        Task { await self.end() }
    }

    @available(iOS 16.2, *)
    private static func running() -> [Activity<T2QClockActivityAttributes>] {
        Activity<T2QClockActivityAttributes>.activities.filter {
            $0.activityState == .active || $0.activityState == .stale
        }
    }
}

/// The page's way to the clock-in Live Activity (JS name "T2QClockActivity").
@objc(T2QClockActivityPlugin)
public class T2QClockActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T2QClockActivityPlugin"
    public let jsName = "T2QClockActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    /// `{ supported, enabled, active, count }`.
    @objc func status(_ call: CAPPluginCall) {
        let controller = T2QClockActivityController.shared
        call.resolve([
            "supported": controller.supported,
            "enabled": controller.enabled,
            "active": controller.active,
            "count": controller.count,
        ])
    }

    /// `{ entryId, startedAt }` (startedAt as an ISO 8601 time) -> `{ result }`.
    @objc func sync(_ call: CAPPluginCall) {
        guard let entryId = call.getString("entryId"), !entryId.isEmpty,
              let started = call.getString("startedAt"), let startedAt = Self.date(from: started) else {
            call.reject("An entry and when it started are needed.")
            return
        }
        call.resolve(["result": T2QClockActivityController.shared.sync(entryId: entryId, startedAt: startedAt)])
    }

    /// Ends the activity -> `{ ended }` (how many).
    @objc func end(_ call: CAPPluginCall) {
        Task {
            let ended = await T2QClockActivityController.shared.end()
            call.resolve(["ended": ended])
        }
    }

    /// An ISO 8601 time, with or without fractional seconds ("2026-10-03T07:02:11.123Z").
    static func date(from text: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: text) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: text)
    }
}
