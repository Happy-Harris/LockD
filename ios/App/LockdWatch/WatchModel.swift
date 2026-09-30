import Foundation
import SwiftUI
import WatchConnectivity
import WatchKit

/// Talks to the phone. The phone owns the log: this model holds the last snapshot it was sent and sends intents
/// back. It never logs anything by itself, and with the phone out of reach it logs nothing at all.
final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var snapshot: WatchSnapshot?
    @Published var phoneReachable = false

    private var restTimer: Timer?

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: Sending intents

    func send(_ intent: WatchIntent) {
        guard WCSession.default.isReachable,
              let data = try? JSONSerialization.data(withJSONObject: intent.payload),
              let text = String(data: data, encoding: .utf8)
        else { return }
        WCSession.default.sendMessage(["intent": text], replyHandler: nil) { _ in
            DispatchQueue.main.async { self.phoneReachable = WCSession.default.isReachable }
        }
    }

    // MARK: Receiving snapshots

    private func apply(_ payload: [String: Any]) {
        guard let text = payload["snapshot"] as? String else { return }
        let decoded = text.isEmpty ? nil : try? JSONDecoder().decode(WatchSnapshot.self, from: Data(text.utf8))
        DispatchQueue.main.async {
            if let decoded = decoded, decoded.version != 1 { return }
            self.snapshot = decoded
            self.scheduleRestHaptic()
        }
    }

    /// A haptic at the end of rest while the app is in front. With the wrist down, the phone's own end-of-rest
    /// notification is mirrored to the watch by the system.
    private func scheduleRestHaptic() {
        restTimer?.invalidate()
        guard let snapshot = snapshot, snapshot.vibrate, let rest = snapshot.rest, rest.isRunning,
              let end = rest.endDate, end > Date()
        else { return }
        restTimer = Timer.scheduledTimer(withTimeInterval: end.timeIntervalSinceNow, repeats: false) { _ in
            WKInterfaceDevice.current().play(.notification)
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.phoneReachable = session.isReachable }
        apply(session.receivedApplicationContext)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.phoneReachable = session.isReachable }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        apply(message)
    }
}
