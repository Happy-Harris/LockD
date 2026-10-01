import Foundation
import WatchConnectivity

/// The phone's end of WatchConnectivity. It is started from the app delegate, not from the plugin, so a tap sent
/// while the web layer is not running still reaches native code: it is written to the durable inbox at once and the
/// web layer applies it when it runs. Nothing here decides anything or touches the log.
final class WatchRelay: NSObject, WCSessionDelegate {
    static let shared = WatchRelay()

    /// Taps older than this when they arrive are still queued; the web layer decides whether they are too old.
    private static let futureSkewMs = 5_000.0
    private static let maxAgeMs = 24.0 * 60 * 60 * 1000

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// The application context is the latest state and survives a watch that is asleep; a live message also goes out
    /// when the watch is in reach, so the screen changes at once.
    func push(_ snapshot: String) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let payload: [String: Any] = ["snapshot": snapshot]
        try? WCSession.default.updateApplicationContext(payload)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    /// Queues one tap. Returns its id (so the watch can be told "the phone has it") or nil when it was unreadable.
    @discardableResult
    private func enqueue(_ message: [String: Any]) -> String? {
        guard let text = message["intent"] as? String,
              let data = text.data(using: .utf8),
              let intent = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        let now = Date().timeIntervalSince1970 * 1000
        // The tap's own time, from the watch's clock (kept in step with the phone's), when it is plausible.
        var tappedAt = now
        if let sent = intent["sentAtMs"] as? Double, sent <= now + WatchRelay.futureSkewMs, now - sent < WatchRelay.maxAgeMs {
            tappedAt = min(sent, now)
        }
        let id = intent["id"] as? String
        let store = PendingActionStore.watch
        store.enqueue(id: id, receivedAtMs: tappedAt, payload: intent)
        store.announce()
        return id
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        enqueue(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        // "queued" means the phone's native side has the tap. It is not "done": the web store has not applied it yet.
        replyHandler(["queued": enqueue(message) != nil])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        enqueue(userInfo)
    }
}
