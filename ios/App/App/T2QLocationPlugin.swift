import Capacitor
import CoreLocation
import Foundation
import Security
import UIKit
import UserNotifications

/// Tradies2Quote's location engine. It owns the one location manager and
/// is started from AppDelegate at launch, so when iOS wakes the app for a
/// job-site arrival (or a move while clocked in) with the app closed, the
/// event is handled here without loading the website.
///
/// Only what the person turned on in the app, and only for work:
///  - Start/Finish work: a single current position.
///  - While clocked in ("tracking"): the route, to work out travel. Exact
///    updates every 50 m while the app is open; with the app closed, iOS's
///    significant-change updates (roughly every 500 m, needs "Always").
///    The app declares no background-location mode.
///  - Automatic clock-in ("autoClock"): iOS region monitoring on up to 18
///    job sites (needs "Always"), which works with the app closed and costs
///    almost no battery. Arrivals inside the person's work hours, and any
///    departure that ends an automatic clock-in, are saved with the time
///    they happened and handed to the page, which clocks in or out at that
///    time. They stay saved until the page says the server has them.
/// Route points go to /api/location/points with the signed-in person's
/// upload key (kept in the keychain, tied to their account: someone else
/// signing in on this phone starts from nothing).
final class T2QLocationEngine: NSObject, CLLocationManagerDelegate {
    static let shared = T2QLocationEngine()

    let manager = CLLocationManager()
    private let store = UserDefaults.standard
    private let regionPrefix = "t2q.site."
    private var started = false
    private var foreground = true
    private var fixWaiters: [(CLLocation?) -> Void] = []
    private var authWaiters: [(String) -> Void] = []
    private var wantsAlways = false
    /// Asked for "Always" and waiting to see whether iOS shows its prompt.
    private var alwaysPromptPending = false
    private var uploading = false
    private var flushTimer: Timer?
    /// Waiting for the route to be sent (the page's flush before Finish).
    private var flushWaiters: [() -> Void] = []

    /// Told when arrivals or departures are waiting (the plugin tells the page).
    var onSiteEvent: (() -> Void)?

    /// Arrivals and departures kept for the page: the newest 50, none older than a day.
    private let maxEvents = 50
    private let eventMaxAge: TimeInterval = 24 * 60 * 60

    enum Key {
        static let endpoint = "t2q.location.endpoint"
        static let tracking = "t2q.location.tracking"
        static let autoClock = "t2q.location.autoClock"
        static let sites = "t2q.location.sites"
        static let window = "t2q.location.window"
        static let openSite = "t2q.location.openSite"
        static let buffer = "t2q.location.buffer"
        static let events = "t2q.location.events"
        /// An arrival not yet confirmed by the page: leaving that site before
        /// the page has clocked in still counts.
        static let pendingEnter = "t2q.location.pendingEnter"
        /// The account the upload key, route and events belong to.
        static let user = "t2q.location.user"
    }

    // MARK: - Starting

    /// Main thread, at launch. Safe to call again.
    func start() {
        guard !started else { return }
        started = true
        foreground = UIApplication.shared.applicationState != .background
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 50
        manager.activityType = .otherNavigation
        manager.pausesLocationUpdatesAutomatically = false
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appBecameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appResigningActive), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appEnteredBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        apply()
    }

    @objc private func appBecameActive() {
        foreground = true
        // Back from an iOS location prompt. Keeping "While using" on the
        // "Always" prompt changes nothing, so iOS won't say; answer the page.
        if !authWaiters.isEmpty, !wantsAlways, !alwaysPromptPending, manager.authorizationStatus != .notDetermined {
            settleAuthWaiters()
        }
        apply()
    }

    @objc private func appResigningActive() {
        // The "Always" prompt is on screen: its answer comes on return.
        alwaysPromptPending = false
    }

    @objc private func appEnteredBackground() {
        foreground = false
        apply()
        flush()
    }

    // MARK: - Asking

    func statusName() -> String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }

    /// "While using the app": pins, travel while open, weather.
    func requestWhenInUse(_ done: @escaping (String) -> Void) {
        guard manager.authorizationStatus == .notDetermined else {
            done(statusName())
            return
        }
        authWaiters.append(done)
        manager.requestWhenInUseAuthorization()
    }

    /// "Always": only for automatic clock-in. iOS asks "while using" first,
    /// then offers "Always" straight after.
    func requestAlways(_ done: @escaping (String) -> Void) {
        switch manager.authorizationStatus {
        case .notDetermined:
            wantsAlways = true
            authWaiters.append(done)
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            authWaiters.append(done)
            askAlways()
        default:
            done(statusName())
        }
    }

    /// iOS shows the "Change to Always Allow" prompt only once. When it
    /// doesn't appear, the app stays active and there'll be no answer to
    /// wait for, so settle with what we have.
    private func askAlways() {
        alwaysPromptPending = true
        manager.requestAlwaysAuthorization()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self = self, self.alwaysPromptPending, UIApplication.shared.applicationState == .active else { return }
            self.alwaysPromptPending = false
            self.settleAuthWaiters()
        }
    }

    private func settleAuthWaiters() {
        let waiting = authWaiters
        authWaiters.removeAll()
        let status = statusName()
        waiting.forEach { $0(status) }
    }

    /// Where the phone is now: a fresh fix, or the last known one after 12 s.
    func currentFix(_ done: @escaping (CLLocation?) -> Void) {
        if let last = manager.location, last.horizontalAccuracy > 0, last.horizontalAccuracy <= 100,
           abs(last.timestamp.timeIntervalSinceNow) < 30 {
            done(last)
            return
        }
        var answered = false
        let waiter: (CLLocation?) -> Void = { location in
            guard !answered else { return }
            answered = true
            done(location)
        }
        fixWaiters.append(waiter)
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestLocation()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self = self, !answered else { return }
            let last = self.manager.location
            waiter(last.flatMap { $0.horizontalAccuracy > 0 ? $0 : nil })
        }
    }

    // MARK: - Settings from the page

    /// Main thread. Stores only plain values (see Plist.clean) and applies them.
    /// `userId` is the signed-in account: when it isn't the one this phone's
    /// key, route and events belong to, all of that is forgotten first, so
    /// nothing of one person's carries over to the next on the same phone.
    func configure(userId: String?, endpoint: String?, token: String?, tracking: Bool, autoClock: Bool,
                   sites: Any?, window: Any?, openSite: Any?) {
        if let userId = userId, !userId.isEmpty, store.string(forKey: Key.user) != userId {
            forget()
            store.set(userId, forKey: Key.user)
        }
        if let token = token, !token.isEmpty { Keychain.write(token) }
        if let endpoint = endpoint, endpoint.hasPrefix("https://") || endpoint.hasPrefix("http://localhost") {
            store.set(endpoint, forKey: Key.endpoint)
        }
        store.set(tracking, forKey: Key.tracking)
        store.set(autoClock, forKey: Key.autoClock)
        // Only plain values reach UserDefaults: a JavaScript null arrives as
        // NSNull, which UserDefaults refuses by crashing the app.
        store.set(Plist.clean(sites ?? []) ?? [], forKey: Key.sites)
        store.set(Plist.clean(window ?? [:]) ?? [:], forKey: Key.window)
        if let open = openSite, let clean = Plist.clean(open) as? [String: Any], !clean.isEmpty {
            store.set(clean, forKey: Key.openSite)
        } else {
            store.removeObject(forKey: Key.openSite)
        }
        if autoClock {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
        apply()
    }

    /// Arrivals and departures not yet confirmed by the page (oldest first).
    /// They stay until ackEvents: a clock-in the server never got is tried
    /// again. None for another account than the one they were saved for.
    func pendingEvents(for userId: String?) -> [[String: Any]] {
        if let userId = userId, let bound = store.string(forKey: Key.user), bound != userId { return [] }
        return keptEvents()
    }

    /// The page is done with these (the server has them, or they no longer apply).
    func ackEvents(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        let done = Set(ids)
        let pending = store.string(forKey: Key.pendingEnter)
        var left: [[String: Any]] = []
        for event in keptEvents() {
            guard let id = event["id"] as? String, done.contains(id) else {
                left.append(event)
                continue
            }
            if event["type"] as? String == "enter", let clientId = event["clientId"] as? String, clientId == pending {
                store.removeObject(forKey: Key.pendingEnter)
            }
        }
        store.set(left, forKey: Key.events)
    }

    /// For pages from before acknowledgements: hands the events over and forgets them.
    func drainEvents() -> [Any] {
        let events = keptEvents()
        store.removeObject(forKey: Key.events)
        store.removeObject(forKey: Key.pendingEnter)
        return events
    }

    /// The saved events, oldest first, each with an id (builds before
    /// acknowledgements saved them without one), bounded: the newest 50,
    /// none older than a day (the server refuses clock-ins that late anyway).
    private func keptEvents() -> [[String: Any]] {
        let saved = store.array(forKey: Key.events) as? [[String: Any]] ?? []
        let oldest = (Date().timeIntervalSince1970 - eventMaxAge) * 1000
        var kept: [[String: Any]] = []
        var changed = false
        for var event in saved {
            guard let t = (event["t"] as? NSNumber)?.doubleValue, t >= oldest else {
                changed = true
                continue
            }
            if (event["id"] as? String) == nil {
                event["id"] = UUID().uuidString
                changed = true
            }
            kept.append(event)
        }
        if kept.count > maxEvents {
            kept = Array(kept.suffix(maxEvents))
            changed = true
        }
        if changed { store.set(kept, forKey: Key.events) }
        return kept
    }

    /// Location turned off, signed out, or the key refused: stop everything
    /// and forget the person (key, unsent route, events, sites).
    func stopAll() {
        forget()
        apply()
    }

    /// Everything that belongs to the person using location on this phone.
    private func forget() {
        Keychain.delete()
        store.set(false, forKey: Key.tracking)
        store.set(false, forKey: Key.autoClock)
        for key in [Key.user, Key.buffer, Key.events, Key.pendingEnter, Key.openSite, Key.sites, Key.window] {
            store.removeObject(forKey: key)
        }
    }

    func watchingCount() -> Int { ourRegions().count }

    func isTracking() -> Bool { store.bool(forKey: Key.tracking) }

    /// The account this phone's location belongs to, if any.
    func boundUser() -> String? { store.string(forKey: Key.user) }

    // MARK: - Applying the settings

    private func apply() {
        let status = manager.authorizationStatus
        let tracking = store.bool(forKey: Key.tracking)
        let autoClock = store.bool(forKey: Key.autoClock)

        // Job-site regions (automatic clock-in needs "Always").
        var wanted: [String: CLCircularRegion] = [:]
        if autoClock, status == .authorizedAlways, CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) {
            for site in sites() where wanted.count < 18 {
                let center = CLLocationCoordinate2D(latitude: site.lat, longitude: site.lng)
                let id = regionPrefix + site.id
                guard wanted[id] == nil, CLLocationCoordinate2DIsValid(center) else { continue }
                let radius = min(max(site.radius, 100), manager.maximumRegionMonitoringDistance)
                let region = CLCircularRegion(center: center, radius: radius, identifier: id)
                region.notifyOnEntry = true
                region.notifyOnExit = true
                wanted[id] = region
            }
        }
        for region in ourRegions() where wanted[region.identifier] == nil { manager.stopMonitoring(for: region) }
        let watching = Set(ourRegions().map(\.identifier))
        for (id, region) in wanted where !watching.contains(id) { manager.startMonitoring(for: region) }

        // The route while clocked in: exact while the app is open...
        let allowed = status == .authorizedAlways || status == .authorizedWhenInUse
        if tracking, allowed, foreground {
            manager.startUpdatingLocation()
            if flushTimer == nil {
                flushTimer = Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { [weak self] _ in self?.flush() }
            }
        } else {
            manager.stopUpdatingLocation()
            flushTimer?.invalidate()
            flushTimer = nil
        }
        // ...and roughly with the app closed (no background mode needed).
        if tracking, status == .authorizedAlways, CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
        } else {
            manager.stopMonitoringSignificantLocationChanges()
        }
        if !tracking { flush() }
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        if wantsAlways, status == .authorizedWhenInUse {
            // Straight on to the "Always" question; answer the page after it.
            wantsAlways = false
            askAlways()
        } else if status != .notDetermined {
            wantsAlways = false
            alwaysPromptPending = false
            settleAuthWaiters()
        }
        if status != .notDetermined, !fixWaiters.isEmpty {
            if status == .denied || status == .restricted {
                let waiting = fixWaiters
                fixWaiters.removeAll()
                waiting.forEach { $0(nil) }
            } else {
                manager.requestLocation()
            }
        }
        apply()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        if !fixWaiters.isEmpty, last.horizontalAccuracy > 0 {
            let waiting = fixWaiters
            fixWaiters.removeAll()
            waiting.forEach { $0(last) }
        }
        guard store.bool(forKey: Key.tracking) else { return }
        var buffer = store.array(forKey: Key.buffer) as? [[String: Any]] ?? []
        // Rough fixes (wifi/cell, with the app closed) are kept too; the km
        // sum only counts them for moves bigger than their error.
        for location in locations where location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 1000 {
            var point: [String: Any] = [
                "t": location.timestamp.timeIntervalSince1970 * 1000,
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude,
                "acc": location.horizontalAccuracy,
            ]
            // Speed is -1 when iOS doesn't know it (standing still); leave it
            // out, never NSNull, which UserDefaults can't hold.
            if location.speed >= 0 { point["speed"] = location.speed }
            buffer.append(point)
        }
        store.set(Array(buffer.suffix(2000)), forKey: Key.buffer)
        // With the app closed iOS gives only seconds: send each update now.
        if buffer.count >= 30 || !foreground { flush() }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard !fixWaiters.isEmpty, (error as? CLError)?.code != .locationUnknown else { return }
        let waiting = fixWaiters
        fixWaiters.removeAll()
        waiting.forEach { $0(nil) }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        siteEvent("enter", region)
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        siteEvent("exit", region)
    }

    // MARK: - Arrivals and departures

    private func siteEvent(_ type: String, _ region: CLRegion) {
        guard region.identifier.hasPrefix(regionPrefix), store.bool(forKey: Key.autoClock) else { return }
        // Work hours only decide when an arrival starts the clock. Leaving
        // always ends an automatic clock-in, or someone who leaves after
        // hours would stay clocked in overnight.
        if type == "enter", !inWorkWindow(Date()) { return }
        let clientId = String(region.identifier.dropFirst(regionPrefix.count))
        let pending = store.string(forKey: Key.pendingEnter)
        let clockedIn = store.bool(forKey: Key.tracking) || pending != nil
        let open = store.dictionary(forKey: Key.openSite)
        let openAuto = pending == clientId || ((open?["auto"] as? Bool) == true && (open?["clientId"] as? String) == clientId)
        // Arriving counts when not clocked in; leaving only ends an automatic clock-in at this site.
        guard (type == "enter" && !clockedIn) || (type == "exit" && clockedIn && openAuto) else { return }

        var event: [String: Any] = [
            "id": UUID().uuidString,
            "type": type,
            "clientId": clientId,
            "t": Date().timeIntervalSince1970 * 1000,
        ]
        if let here = manager.location, abs(here.timestamp.timeIntervalSinceNow) < 120, here.horizontalAccuracy > 0 {
            event["lat"] = here.coordinate.latitude
            event["lng"] = here.coordinate.longitude
            event["acc"] = here.horizontalAccuracy
        }
        var events = keptEvents()
        events.append(event)
        store.set(Array(events.suffix(maxEvents)), forKey: Key.events)
        if type == "enter" {
            store.set(clientId, forKey: Key.pendingEnter)
        } else if pending == clientId {
            store.removeObject(forKey: Key.pendingEnter)
        }
        onSiteEvent?()

        let name = sites().first(where: { $0.id == clientId })?.name ?? "the job"
        let time = clockTime(Date())
        notify(
            type == "enter" ? "Arrived at the \(name) job" : "Left the \(name) job",
            type == "enter" ? "\(time). Your hours start from then." : "\(time). Your hours stop then."
        )
    }

    // MARK: - Sending the route

    /// Send the route now (the page does this before Finish, so the last
    /// stretch is in before the session closes). `done` runs once nothing is
    /// left to send, or sending failed, or there's no key.
    func flushNow(_ done: @escaping () -> Void) {
        flushWaiters.append(done)
        flush()
    }

    private func settleFlushWaiters() {
        let waiting = flushWaiters
        flushWaiters.removeAll()
        waiting.forEach { $0() }
    }

    private func flush() {
        // An upload is under way: it settles the waiters when it's done.
        guard !uploading else { return }
        guard let token = Keychain.read(),
              let endpoint = store.string(forKey: Key.endpoint),
              let url = URL(string: endpoint) else {
            settleFlushWaiters()
            return
        }
        let buffer = store.array(forKey: Key.buffer) as? [[String: Any]] ?? []
        let batch = Array(buffer.prefix(500))
        guard !batch.isEmpty, let body = try? JSONSerialization.data(withJSONObject: ["points": batch]) else {
            settleFlushWaiters()
            return
        }
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = body
        uploading = true
        var task: UIBackgroundTaskIdentifier = .invalid
        task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.uploading = false
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                var more = false
                if code == 200 || code == 400 {
                    // Kept (or refused as malformed, which sending again won't fix).
                    let now = self.store.array(forKey: Key.buffer) as? [[String: Any]] ?? []
                    let rest = Array(now.dropFirst(batch.count))
                    self.store.set(rest, forKey: Key.buffer)
                    more = code == 200 && !rest.isEmpty
                } else if code == 401 || code == 403 {
                    // The key is refused: location was turned off, or the
                    // account is gone. Stop tracking and forget it all.
                    self.stopAll()
                }
                UIApplication.shared.endBackgroundTask(task)
                if more, !self.flushWaiters.isEmpty {
                    self.flush()
                } else {
                    self.settleFlushWaiters()
                }
            }
        }.resume()
    }

    // MARK: - Helpers

    private struct Site {
        let id: String
        let name: String
        let lat: Double
        let lng: Double
        let radius: Double
    }

    private func sites() -> [Site] {
        (store.array(forKey: Key.sites) as? [[String: Any]] ?? []).compactMap { raw in
            guard let id = raw["id"] as? String,
                  let lat = raw["lat"] as? Double,
                  let lng = raw["lng"] as? Double else { return nil }
            return Site(id: id, name: raw["name"] as? String ?? "client", lat: lat, lng: lng, radius: raw["radius"] as? Double ?? 150)
        }
    }

    private func ourRegions() -> [CLRegion] {
        manager.monitoredRegions.filter { $0.identifier.hasPrefix(regionPrefix) }
    }

    private func businessZone() -> TimeZone {
        let window = store.dictionary(forKey: Key.window) ?? [:]
        return TimeZone(identifier: window["timeZone"] as? String ?? "") ?? TimeZone(identifier: "Pacific/Auckland") ?? .current
    }

    /// Inside the person's work hours and days, in the business's time zone.
    private func inWorkWindow(_ date: Date) -> Bool {
        let window = store.dictionary(forKey: Key.window) ?? [:]
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = businessZone()
        let parts = calendar.dateComponents([.weekday, .hour, .minute], from: date)
        let weekday = (parts.weekday ?? 1) - 1 // 0 = Sunday
        let minutes = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        let days = (window["days"] as? [Int]) ?? [1, 2, 3, 4, 5, 6]
        func toMinutes(_ value: Any?) -> Int? {
            guard let text = value as? String else { return nil }
            let bits = text.split(separator: ":").compactMap { Int($0) }
            return bits.count >= 2 ? bits[0] * 60 + bits[1] : nil
        }
        let start = toMinutes(window["start"]) ?? 5 * 60
        let end = toMinutes(window["end"]) ?? 19 * 60
        return days.contains(weekday) && minutes >= start && minutes < end
    }

    private func clockTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_NZ")
        formatter.timeZone = businessZone()
        formatter.dateFormat = "h:mma"
        return formatter.string(from: date).lowercased()
    }

    private func notify(_ title: String, _ body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(identifier: "t2q.site.\(UUID().uuidString)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

/// The page's side of location (JS name "T2QLocation"; the web side is
/// src/lib/location/device.ts and the LocationBridge component). A thin
/// bridge: the work happens in T2QLocationEngine.
@objc(T2QLocationPlugin)
public class T2QLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T2QLocationPlugin"
    public let jsName = "T2QLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "currentPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "permission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestWhenInUse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    /// What this build does, for the page (1: before events were acknowledged
    /// and keys tied to an account; 2: pendingEvents, ackEvents, flush, userId).
    private let api = 2

    private var engine: T2QLocationEngine { T2QLocationEngine.shared }

    override public func load() {
        DispatchQueue.main.async {
            self.engine.start()
            self.engine.onSiteEvent = { [weak self] in
                self?.notifyListeners("siteEvent", data: [:], retainUntilConsumed: true)
            }
        }
    }

    @objc func permission(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["status": self.engine.statusName()]) }
    }

    @objc func requestWhenInUse(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.engine.requestWhenInUse { call.resolve(["status": $0]) } }
    }

    @objc func requestAlways(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.engine.requestAlways { call.resolve(["status": $0]) } }
    }

    @objc func currentPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let status = self.engine.manager.authorizationStatus
            if status == .denied || status == .restricted {
                call.reject("Location is off for Tradies2Quote in Settings.", "denied")
                return
            }
            self.engine.currentFix { location in
                guard let location = location else {
                    call.reject("Couldn't find your location.", "timeout")
                    return
                }
                call.resolve([
                    "lat": location.coordinate.latitude,
                    "lng": location.coordinate.longitude,
                    "acc": location.horizontalAccuracy,
                    "t": location.timestamp.timeIntervalSince1970 * 1000,
                ])
            }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var result: [String: Any] = [
                "api": self.api,
                "hasToken": Keychain.read() != nil,
                "tracking": self.engine.isTracking(),
                "watching": self.engine.watchingCount(),
            ]
            if let user = self.engine.boundUser() { result["userId"] = user }
            call.resolve(result)
        }
    }

    @objc func configure(_ call: CAPPluginCall) {
        let userId = call.getString("userId")
        let endpoint = call.getString("endpoint")
        let token = call.getString("token")
        let tracking = call.getBool("tracking") ?? false
        let autoClock = call.getBool("autoClock") ?? false
        let sites = call.getArray("sites", JSObject.self)
        let window = call.getObject("window")
        let openSite = call.getObject("openSite")
        DispatchQueue.main.async {
            self.engine.configure(userId: userId, endpoint: endpoint, token: token, tracking: tracking, autoClock: autoClock,
                                  sites: sites, window: window, openSite: openSite)
            call.resolve()
        }
    }

    @objc func pendingEvents(_ call: CAPPluginCall) {
        let userId = call.getString("userId")
        DispatchQueue.main.async {
            let events = Plist.clean(self.engine.pendingEvents(for: userId)) as? [Any] ?? []
            call.resolve(["events": events])
        }
    }

    @objc func ackEvents(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") ?? []).compactMap { $0 as? String }
        DispatchQueue.main.async {
            self.engine.ackEvents(ids)
            call.resolve()
        }
    }

    @objc func drainEvents(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let events = Plist.clean(self.engine.drainEvents()) as? [Any] ?? []
            call.resolve(["events": events])
        }
    }

    @objc func flush(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.engine.flushNow { call.resolve() }
        }
    }

    @objc func stopAll(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.engine.stopAll()
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }
}

/// Turns values from the page into ones UserDefaults accepts (strings,
/// numbers, booleans, dates, arrays and dictionaries), dropping nulls.
private enum Plist {
    static func clean(_ value: Any) -> Any? {
        switch value {
        case is NSNull:
            return nil
        case let text as String:
            return text
        case let number as NSNumber:
            return number
        case let date as Date:
            return date
        case let dict as [String: Any]:
            var out: [String: Any] = [:]
            for (key, item) in dict { if let item = clean(item) { out[key] = item } }
            return out
        case let list as [Any]:
            return list.compactMap { clean($0) }
        default:
            return nil
        }
    }
}

/// The upload key, in the keychain (this device only, after first unlock so
/// the background sender can read it).
private enum Keychain {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.str8builders.tradies2quote.location",
        kSecAttrAccount as String: "upload-key",
    ]

    static func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ value: String) {
        delete()
        var q = query
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
