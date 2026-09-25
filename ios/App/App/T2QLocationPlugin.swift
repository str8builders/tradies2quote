import Capacitor
import CoreLocation
import Foundation
import Security
import UIKit
import UserNotifications

/// Tradies2Quote's location module (JS name "T2QLocation"; the web side is
/// src/lib/location/device.ts and the LocationBridge component).
///
/// Only what the person turned on in the app, and only for work:
///  - While they're clocked in ("tracking"), the route: standard location
///    updates every 50 m, sent to /api/location/points with this phone's
///    upload key (kept in the keychain), even with the app in the
///    background. iOS shows its blue location pill while this runs.
///  - Automatic clock-in ("autoClock"): iOS region monitoring on up to 18
///    job sites, which works with the app closed and costs almost no
///    battery. Arrivals and departures inside the person's work hours are
///    saved here with the time they happened and handed to the web page,
///    which clocks in or out at that time. Nothing is sent on arrival until
///    then; outside work hours nothing happens at all.
///  - Start/Finish work: a single current position.
@objc(T2QLocationPlugin)
public class T2QLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "T2QLocationPlugin"
    public let jsName = "T2QLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "currentPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "permission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private let manager = CLLocationManager()
    private let store = UserDefaults.standard
    private let regionPrefix = "t2q.site."
    private var fixCalls: [CAPPluginCall] = []
    private var authCalls: [CAPPluginCall] = []
    private var wantsAlways = false
    private var uploading = false
    private var flushTimer: Timer?

    private enum Key {
        static let endpoint = "t2q.location.endpoint"
        static let tracking = "t2q.location.tracking"
        static let autoClock = "t2q.location.autoClock"
        static let sites = "t2q.location.sites"
        static let window = "t2q.location.window"
        static let openSite = "t2q.location.openSite"
        static let buffer = "t2q.location.buffer"
        static let events = "t2q.location.events"
    }

    // MARK: - Lifecycle

    override public func load() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 50
        manager.activityType = .otherNavigation
        manager.pausesLocationUpdatesAutomatically = false
        apply()
    }

    // MARK: - JS methods

    @objc func permission(_ call: CAPPluginCall) {
        call.resolve(["status": statusName()])
    }

    @objc func requestAlways(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            switch self.manager.authorizationStatus {
            case .notDetermined:
                self.wantsAlways = true
                self.authCalls.append(call)
                self.manager.requestWhenInUseAuthorization()
            case .authorizedWhenInUse:
                self.manager.requestAlwaysAuthorization()
                call.resolve(["status": self.statusName()])
            default:
                call.resolve(["status": self.statusName()])
            }
        }
    }

    @objc func currentPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let status = self.manager.authorizationStatus
            if status == .denied || status == .restricted {
                call.reject("Location is off for Tradies2Quote in Settings.", "denied")
                return
            }
            if let last = self.manager.location, last.horizontalAccuracy > 0, last.horizontalAccuracy <= 100,
               abs(last.timestamp.timeIntervalSinceNow) < 30 {
                call.resolve(self.fix(last))
                return
            }
            self.fixCalls.append(call)
            if status == .notDetermined {
                self.manager.requestWhenInUseAuthorization()
            } else {
                self.manager.requestLocation()
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
                guard let self = self, let index = self.fixCalls.firstIndex(where: { $0 === call }) else { return }
                self.fixCalls.remove(at: index)
                if let last = self.manager.location, last.horizontalAccuracy > 0 {
                    call.resolve(self.fix(last))
                } else {
                    call.reject("Couldn't find your location.", "timeout")
                }
            }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "hasToken": Keychain.read() != nil,
                "tracking": self.store.bool(forKey: Key.tracking),
                "watching": self.ourRegions().count,
            ])
        }
    }

    @objc func configure(_ call: CAPPluginCall) {
        if let token = call.getString("token"), !token.isEmpty { Keychain.write(token) }
        if let endpoint = call.getString("endpoint"), endpoint.hasPrefix("https://") || endpoint.hasPrefix("http://localhost") {
            store.set(endpoint, forKey: Key.endpoint)
        }
        store.set(call.getBool("tracking") ?? false, forKey: Key.tracking)
        let autoClock = call.getBool("autoClock") ?? false
        store.set(autoClock, forKey: Key.autoClock)
        // Only plain values reach UserDefaults: a JavaScript null arrives as
        // NSNull, which UserDefaults refuses by crashing the app.
        store.set(Plist.clean(call.getArray("sites", JSObject.self) ?? []) ?? [], forKey: Key.sites)
        store.set(Plist.clean(call.getObject("window") ?? [:]) ?? [:], forKey: Key.window)
        if let open = call.getObject("openSite"), let clean = Plist.clean(open) {
            store.set(clean, forKey: Key.openSite)
        } else {
            store.removeObject(forKey: Key.openSite)
        }
        if autoClock {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
        DispatchQueue.main.async {
            self.apply()
            call.resolve()
        }
    }

    /// Arrivals and departures saved since the page last asked (oldest first).
    @objc func drainEvents(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let events = self.store.array(forKey: Key.events) ?? []
            self.store.removeObject(forKey: Key.events)
            call.resolve(["events": events])
        }
    }

    /// Location turned off: stop everything and forget the upload key.
    @objc func stopAll(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.store.set(false, forKey: Key.tracking)
            self.store.set(false, forKey: Key.autoClock)
            self.store.removeObject(forKey: Key.buffer)
            self.store.removeObject(forKey: Key.events)
            Keychain.delete()
            self.apply()
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

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

        // The route while clocked in.
        if tracking, status == .authorizedAlways || status == .authorizedWhenInUse {
            // Turning this on without the "location" background mode in
            // Info.plist is a crash, so check rather than assume.
            if Self.hasBackgroundLocationMode {
                manager.allowsBackgroundLocationUpdates = true
                manager.showsBackgroundLocationIndicator = true
            }
            manager.startUpdatingLocation()
            if flushTimer == nil {
                flushTimer = Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { [weak self] _ in self?.flush() }
            }
        } else {
            manager.stopUpdatingLocation()
            if Self.hasBackgroundLocationMode { manager.allowsBackgroundLocationUpdates = false }
            flushTimer?.invalidate()
            flushTimer = nil
            flush()
        }
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        if wantsAlways, status == .authorizedWhenInUse {
            wantsAlways = false
            manager.requestAlwaysAuthorization()
        }
        if status != .notDetermined {
            let calls = authCalls
            authCalls.removeAll()
            calls.forEach { $0.resolve(["status": statusName()]) }
            if !fixCalls.isEmpty {
                if status == .denied || status == .restricted {
                    let calls = fixCalls
                    fixCalls.removeAll()
                    calls.forEach { $0.reject("Location is off for Tradies2Quote in Settings.", "denied") }
                } else {
                    manager.requestLocation()
                }
            }
        }
        apply()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        if !fixCalls.isEmpty, last.horizontalAccuracy > 0 {
            let calls = fixCalls
            fixCalls.removeAll()
            calls.forEach { $0.resolve(fix(last)) }
        }
        guard store.bool(forKey: Key.tracking) else { return }
        var buffer = store.array(forKey: Key.buffer) as? [[String: Any]] ?? []
        for location in locations where location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 100 {
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
        if buffer.count >= 30 { flush() }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard !fixCalls.isEmpty, (error as? CLError)?.code != .locationUnknown else { return }
        let calls = fixCalls
        fixCalls.removeAll()
        calls.forEach { $0.reject("Couldn't find your location.", "unavailable") }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        siteEvent("enter", region)
    }

    public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        siteEvent("exit", region)
    }

    // MARK: - Arrivals and departures

    private func siteEvent(_ type: String, _ region: CLRegion) {
        guard region.identifier.hasPrefix(regionPrefix), store.bool(forKey: Key.autoClock), inWorkWindow(Date()) else { return }
        let clientId = String(region.identifier.dropFirst(regionPrefix.count))
        let tracking = store.bool(forKey: Key.tracking)
        let open = store.dictionary(forKey: Key.openSite)
        let openAuto = (open?["auto"] as? Bool) == true && (open?["clientId"] as? String) == clientId
        // Arriving counts when not clocked in; leaving only ends an automatic clock-in at this site.
        guard (type == "enter" && !tracking) || (type == "exit" && tracking && openAuto) else { return }

        var event: [String: Any] = ["type": type, "clientId": clientId, "t": Date().timeIntervalSince1970 * 1000]
        if let here = manager.location, abs(here.timestamp.timeIntervalSinceNow) < 120 {
            event["lat"] = here.coordinate.latitude
            event["lng"] = here.coordinate.longitude
            event["acc"] = here.horizontalAccuracy
        }
        var events = store.array(forKey: Key.events) ?? []
        events.append(event)
        store.set(Array(events.suffix(50)), forKey: Key.events)
        notifyListeners("siteEvent", data: [:], retainUntilConsumed: true)

        let name = sites().first(where: { $0.id == clientId })?.name ?? "the job"
        let time = clockTime(Date())
        notify(
            type == "enter" ? "Arrived at the \(name) job" : "Left the \(name) job",
            type == "enter" ? "\(time). Your hours start from then." : "\(time). Your hours stop then."
        )
    }

    // MARK: - Sending the route

    private func flush() {
        guard !uploading,
              let token = Keychain.read(),
              let endpoint = store.string(forKey: Key.endpoint),
              let url = URL(string: endpoint) else { return }
        let buffer = store.array(forKey: Key.buffer) as? [[String: Any]] ?? []
        guard !buffer.isEmpty else { return }
        let batch = Array(buffer.prefix(500))
        guard let body = try? JSONSerialization.data(withJSONObject: ["points": batch]) else { return }
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
                if code == 200 {
                    let now = self.store.array(forKey: Key.buffer) as? [[String: Any]] ?? []
                    self.store.set(Array(now.dropFirst(batch.count)), forKey: Key.buffer)
                } else if code == 401 {
                    // Key revoked (location turned off elsewhere): stop sending.
                    Keychain.delete()
                    self.store.removeObject(forKey: Key.buffer)
                }
                UIApplication.shared.endBackgroundTask(task)
            }
        }.resume()
    }

    // MARK: - Helpers

    private static let hasBackgroundLocationMode: Bool =
        (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("location") == true

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

    private func fix(_ location: CLLocation) -> [String: Any] {
        [
            "lat": location.coordinate.latitude,
            "lng": location.coordinate.longitude,
            "acc": location.horizontalAccuracy,
            "t": location.timestamp.timeIntervalSince1970 * 1000,
        ]
    }

    private func statusName() -> String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
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
