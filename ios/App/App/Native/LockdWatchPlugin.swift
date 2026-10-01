import Capacitor
import Foundation
import WatchConnectivity

/// The phone half of the watch companion (Opp 7, docs/design/watch-companion.md). It relays: snapshots go to the
/// watch, and taps from the watch wait in a durable inbox (`PendingActionStore.watch`, filled by `WatchRelay` even
/// while the web layer is not running) until the web store applies and acknowledges them. It holds no log and decides
/// nothing.
@objc(LockdWatchPlugin)
public class LockdWatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LockdWatchPlugin"
    public let jsName = "LockdWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeActions", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?

    override public func load() {
        WatchRelay.shared.start()
        observer = NotificationCenter.default.addObserver(
            forName: .lockdPendingActions, object: nil, queue: .main
        ) { [weak self] note in
            guard (note.userInfo?["store"] as? String) == PendingActionStore.watch.name else { return }
            self?.notifyListeners("pending", data: [:])
        }
    }

    deinit {
        if let observer = observer {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let data = try? JSONSerialization.data(withJSONObject: (call.options as? [String: Any]) ?? [:]),
              let text = String(data: data, encoding: .utf8)
        else {
            call.reject("snapshot could not be encoded")
            return
        }
        WatchRelay.shared.push(text)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        WatchRelay.shared.push("")
        call.resolve()
    }

    @objc func pendingActions(_ call: CAPPluginCall) {
        call.resolve(["items": PendingActionStore.watch.items()])
    }

    @objc func acknowledgeActions(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") as? [String]) ?? []
        PendingActionStore.watch.remove(ids: ids)
        call.resolve()
    }
}
