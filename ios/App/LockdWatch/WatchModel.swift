import Foundation
import SwiftUI
import WatchConnectivity
import WatchKit

/// Talks to the phone. The phone owns the log: this model holds the last snapshot it was sent and sends intents
/// back. It never logs anything by itself, and with the phone out of reach it logs nothing at all.
final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var snapshot: WatchSnapshot?
    @Published var phoneReachable = false
    /// Taps sent and not yet confirmed by the phone. A tap leaves this list only when a snapshot's `acks` names it.
    @Published var pending: [PendingTap] = []
    /// A short line about a tap that was not applied, or that is taking long to confirm.
    @Published var notice: String?

    private var restTimer: Timer?
    private var watchdog: Timer?
    private var noticeTimer: Timer?

    /// After this long unconfirmed, the screen says the phone has not answered yet (it still has not logged anything).
    private static let slowAfter: TimeInterval = 15
    /// After this long the watch stops waiting; the phone may still apply the tap, and says so in a later snapshot.
    private static let giveUpAfter: TimeInterval = 10 * 60

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: Sending intents

    /// A tap is shown as waiting until the phone confirms it. The phone's native side keeps it even when the phone's
    /// screen layer is not running; if the live message fails, the same tap goes out again as a queued transfer
    /// (the phone applies a tap with this id once, however many times it arrives).
    func send(_ intent: WatchIntent) {
        guard WCSession.default.isReachable else { return }
        let id = UUID().uuidString
        let now = Date()
        var body = intent.payload
        body["id"] = id
        body["sentAtMs"] = now.timeIntervalSince1970 * 1000
        guard let data = try? JSONSerialization.data(withJSONObject: body),
              let text = String(data: data, encoding: .utf8)
        else { return }
        pending.append(PendingTap(id: id, kind: intent.kind, setId: intent.setId, sentAt: now))
        notice = nil
        startWatchdog()
        let message = ["intent": text]
        WCSession.default.sendMessage(message, replyHandler: nil) { _ in
            WCSession.default.transferUserInfo(message)
            DispatchQueue.main.async { self.phoneReachable = WCSession.default.isReachable }
        }
    }

    func isWaiting(setId: String) -> Bool {
        pending.contains { $0.setId == setId }
    }

    var isWaitingOnRest: Bool {
        pending.contains { $0.kind != "completeSet" }
    }

    private func show(_ text: String, for seconds: TimeInterval = 6) {
        notice = text
        noticeTimer?.invalidate()
        noticeTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            self?.notice = nil
            self?.noticeTimer = nil
        }
    }

    private func startWatchdog() {
        guard watchdog == nil else { return }
        watchdog = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let now = Date()
            if let oldest = self.pending.map({ $0.sentAt }).min() {
                let waited = now.timeIntervalSince(oldest)
                if waited > WatchModel.giveUpAfter {
                    self.pending.removeAll { now.timeIntervalSince($0.sentAt) > WatchModel.giveUpAfter }
                    self.show("The phone has not confirmed. Check it before assuming a set was logged.", for: 12)
                } else if waited > WatchModel.slowAfter && self.noticeTimer == nil {
                    self.notice = "Waiting for your phone. Nothing is logged until it confirms."
                }
            }
            if self.pending.isEmpty {
                self.watchdog?.invalidate()
                self.watchdog = nil
            }
        }
    }

    private func resolve(_ acks: [WatchSnapshot.Ack]) {
        guard !acks.isEmpty, !pending.isEmpty else { return }
        for ack in acks where pending.contains(where: { $0.id == ack.id }) {
            pending.removeAll { $0.id == ack.id }
            if ack.result != "applied" { show(droppedMessage(ack.reason)) }
            else if notice?.hasPrefix("Waiting for your phone") == true { notice = nil }
        }
    }

    // MARK: Receiving snapshots

    private func apply(_ payload: [String: Any]) {
        guard let text = payload["snapshot"] as? String else { return }
        let decoded = text.isEmpty ? nil : try? JSONDecoder().decode(WatchSnapshot.self, from: Data(text.utf8))
        DispatchQueue.main.async {
            if let decoded = decoded, decoded.version != 1 { return }
            self.snapshot = decoded
            if decoded == nil { self.pending.removeAll() }
            if let acks = decoded?.acks { self.resolve(acks) }
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
