import Capacitor
import UIKit

/// The bridge view controller, so plugins that live in this app (not in npm) can be registered.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LockScreenTimerPlugin())
        bridge?.registerPluginInstance(LockdHealthPlugin())
        bridge?.registerPluginInstance(LockdWatchPlugin())
    }
}
