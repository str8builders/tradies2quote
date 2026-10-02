import Capacitor
import UIKit

/// The app's web view, with Tradies2Quote's own native modules registered
/// alongside the npm Capacitor plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(T2QLocationPlugin())
        bridge?.registerPluginInstance(T2QChromePlugin())
        bridge?.registerPluginInstance(T2QHandoffPlugin())
        bridge?.registerPluginInstance(T2QShortcutsPlugin())
        bridge?.registerPluginInstance(T2QCalendarPlugin())
        bridge?.registerPluginInstance(T2QContactsPlugin())
        bridge?.registerPluginInstance(T2QHapticsPlugin())
        bridge?.registerPluginInstance(T2QClockActivityPlugin())
    }

    /// The page draws right up under the clock (contentInset "never"), on
    /// the app's dark look, so the clock and battery start light whatever
    /// the phone's own light/dark setting.
    override open func setStatusBarDefaults() {
        super.setStatusBarDefaults()
        statusBarStyle = .lightContent
    }
}

/// The page's say over the phone's status bar (JS name "T2QChrome"): light
/// clock and battery on the dark look, dark ones in outdoor mode's white.
@objc(T2QChromePlugin)
public class T2QChromePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T2QChromePlugin"
    public let jsName = "T2QChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setStatusBar", returnType: CAPPluginReturnPromise),
    ]

    @objc func setStatusBar(_ call: CAPPluginCall) {
        let style: UIStatusBarStyle = call.getString("style") == "dark" ? .darkContent : .lightContent
        DispatchQueue.main.async {
            (self.bridge?.viewController as? CAPBridgeViewController)?.setStatusBarStyle(style)
            call.resolve()
        }
    }
}

/// One-tap sign-in into T2QCAL (JS name "T2QHandoff"). The page gets a
/// one-time code from the server (/api/t2qcal/handoff) and this leaves it in a
/// named pasteboard: iOS shares a named pasteboard only between apps from the
/// same developer team, so T2QCAL can read it and no other app can. The code
/// never goes in the t2qcal:// link, which any app could register.
/// T2QCAL takes it (and clears it) when it opens; the server accepts it once,
/// within 60 seconds.
@objc(T2QHandoffPlugin)
public class T2QHandoffPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "T2QHandoffPlugin"
    public let jsName = "T2QHandoff"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "offer", returnType: CAPPluginReturnPromise),
    ]

    /// Must match T2QCAL's Handoff.pasteboardName.
    static let pasteboardName = UIPasteboard.Name("com.str8builders.t2qcal-handoff")

    @objc func offer(_ call: CAPPluginCall) {
        guard let code = call.getString("code"), let userId = call.getString("userId"),
              !code.isEmpty, !userId.isEmpty else {
            call.reject("A code and an account are needed.")
            return
        }
        let payload: [String: Any] = ["code": code, "userId": userId, "at": Date().timeIntervalSince1970]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else {
            call.reject("Couldn't write the code.")
            return
        }
        DispatchQueue.main.async {
            guard let board = UIPasteboard(name: Self.pasteboardName, create: true) else {
                call.reject("The pasteboard isn't available.")
                return
            }
            board.string = text
            call.resolve()
        }
    }
}

