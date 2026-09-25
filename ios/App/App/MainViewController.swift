import Capacitor
import UIKit

/// The app's web view, with Tradies2Quote's own native modules registered
/// alongside the npm Capacitor plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(T2QLocationPlugin())
    }
}
