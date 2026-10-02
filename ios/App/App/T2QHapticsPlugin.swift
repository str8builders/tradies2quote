import Capacitor
import UIKit

/// A short tap of feedback for the moments that matter: starting and stopping
/// a recording, a quote going out, clocking in and out (JS name "T2QHaptics").
/// Nothing is shown and nothing is asked: the phone just taps the hand.
@objc(T2QHapticsPlugin)
public class T2QHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T2QHapticsPlugin"
    public let jsName = "T2QHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notification", returnType: CAPPluginReturnPromise),
    ]

    /// `{ style: "light" | "medium" | "heavy" }` (default light).
    @objc func impact(_ call: CAPPluginCall) {
        let style: UIImpactFeedbackGenerator.FeedbackStyle
        switch call.getString("style") {
        case "heavy": style = .heavy
        case "medium": style = .medium
        default: style = .light
        }
        DispatchQueue.main.async {
            UIImpactFeedbackGenerator(style: style).impactOccurred()
            call.resolve()
        }
    }

    /// `{ type: "success" | "warning" | "error" }` (default success).
    @objc func notification(_ call: CAPPluginCall) {
        let type: UINotificationFeedbackGenerator.FeedbackType
        switch call.getString("type") {
        case "warning": type = .warning
        case "error": type = .error
        default: type = .success
        }
        DispatchQueue.main.async {
            UINotificationFeedbackGenerator().notificationOccurred(type)
            call.resolve()
        }
    }
}
