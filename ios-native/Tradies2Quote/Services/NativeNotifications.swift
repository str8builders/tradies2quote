import UIKit
import UserNotifications

@MainActor final class NativeAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var state: AppState?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "pushDeviceToken")
        Task { await state?.registerPushToken() }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) { state?.sessionMessage = "Notifications could not be enabled: \(error.localizedDescription)" }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let path = response.notification.request.content.userInfo["url"] as? String,
              let url = URL(string: path, relativeTo: URL(string: "https://tradies2quote.com"))?.absoluteURL else { return }
        await state?.open(url)
    }
}

extension AppState {
    var wantsPush: Bool { guard let accountID else { return false }; return UserDefaults.standard.bool(forKey: "pushEnabled.\(accountID)") }
    func enablePush() async throws {
        guard capabilities["push"].bool, let accountID else { throw ServiceError(status: 503, message: "Notifications are not configured for this app yet.") }
        let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        guard allowed else { throw ServiceError(status: 0, message: "Notifications are off. You can allow them in iPhone Settings.") }
        UserDefaults.standard.set(true, forKey: "pushEnabled.\(accountID)")
        UIApplication.shared.registerForRemoteNotifications()
        await registerPushToken()
    }
    func registerPushToken() async {
        guard wantsPush, capabilities["push"].bool, let token = UserDefaults.standard.string(forKey: "pushDeviceToken") else { return }
        let environment = Bundle.main.object(forInfoDictionaryKey: "T2QPushEnvironment") as? String ?? "production"
        do { _ = try await api.request("/api/push/subscribe", method: "POST", body: .object(["platform": .string("ios"), "token": .string(token), "environment": .string(environment)])) }
        catch { sessionMessage = "Notifications could not be enabled: \(error.localizedDescription)" }
    }
    func disablePush() async throws {
        if let token = UserDefaults.standard.string(forKey: "pushDeviceToken"), accountID != nil {
            _ = try await api.request("/api/push/subscribe", method: "DELETE", body: .object(["endpoint": .string(token)]))
        }
        if let accountID { UserDefaults.standard.removeObject(forKey: "pushEnabled.\(accountID)") }
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
    func suspendDeviceNotifications() {
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
    func resumeDeviceNotifications() async {
        if wantsPush, capabilities["push"].bool { UIApplication.shared.registerForRemoteNotifications(); await registerPushToken() }
    }
}
