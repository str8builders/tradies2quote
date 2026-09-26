import Capacitor
import UIKit

/// The app's web view, with Tradies2Quote's own native modules registered
/// alongside the npm Capacitor plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(T2QLocationPlugin())
        bridge?.registerPluginInstance(T2QChromePlugin())
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
