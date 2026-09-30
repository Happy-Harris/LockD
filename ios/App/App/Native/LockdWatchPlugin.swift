import Capacitor
import Foundation
import WatchConnectivity

/// The phone half of the watch companion (Opp 7, docs/design/watch-companion.md). It relays: snapshots go to the
/// watch, intents come back to the web layer, which applies them through the store. It holds no log and decides nothing.
@objc(LockdWatchPlugin)
public class LockdWatchPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "LockdWatchPlugin"
    public let jsName = "LockdWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    @objc func send(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        guard let data = try? JSONSerialization.data(withJSONObject: (call.options as? [String: Any]) ?? [:]),
              let text = String(data: data, encoding: .utf8)
        else {
            call.reject("snapshot could not be encoded")
            return
        }
        push(text)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve()
            return
        }
        push("")
        call.resolve()
    }

    /// The application context is the latest state and survives a watch that is asleep; a live message also goes out
    /// when the watch is in reach, so the screen changes at once.
    private func push(_ snapshot: String) {
        let payload: [String: Any] = ["snapshot": snapshot]
        try? WCSession.default.updateApplicationContext(payload)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    // MARK: WCSessionDelegate

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        forward(message)
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        forward(message)
        replyHandler(["ok": true])
    }

    private func forward(_ message: [String: Any]) {
        guard let text = message["intent"] as? String,
              let data = text.data(using: .utf8),
              let intent = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        DispatchQueue.main.async {
            self.notifyListeners("intent", data: ["intent": intent])
        }
    }
}
