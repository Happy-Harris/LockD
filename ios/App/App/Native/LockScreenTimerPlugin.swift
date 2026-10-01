import ActivityKit
import Capacitor
import Foundation

/// The iOS half of the lock-screen rest timer (Opp 6, docs/design/lock-screen-rest-timer.md).
///
/// The web store owns the timer. This plugin only draws it as a Live Activity whose clock is bound to `endsAt`, so
/// the system counts down with the app suspended. Button taps (`plus`, `minus`, `stop`) wait in a durable inbox
/// (`PendingActionStore.restTimer`) until the web store applies and acknowledges them. The end-of-rest alert is a separate scheduled notification (local-notifications).
@objc(LockScreenTimerPlugin)
public class LockScreenTimerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LockScreenTimerPlugin"
    public let jsName = "LockScreenTimer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeActions", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?

    override public func load() {
        observer = NotificationCenter.default.addObserver(
            forName: .lockdPendingActions, object: nil, queue: .main
        ) { [weak self] note in
            guard (note.userInfo?["store"] as? String) == PendingActionStore.restTimer.name else { return }
            self?.notifyListeners("pending", data: [:])
        }
    }

    deinit {
        if let observer = observer {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    @objc func pendingActions(_ call: CAPPluginCall) {
        call.resolve(["items": PendingActionStore.restTimer.items()])
    }

    @objc func acknowledgeActions(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") as? [String]) ?? []
        PendingActionStore.restTimer.remove(ids: ids)
        call.resolve()
    }

    @objc func show(_ call: CAPPluginCall) {
        apply(call)
    }

    @objc func update(_ call: CAPPluginCall) {
        apply(call)
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<RestTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    private func apply(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            // Live Activities need iOS 16.2; the scheduled alert still works.
            call.resolve()
            return
        }
        guard let endsAtMs = call.getDouble("endsAtMs") else {
            call.reject("endsAtMs is required")
            return
        }
        let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
        let durationSeconds = Double(call.getInt("durationSeconds") ?? 0)
        let isRunning = call.getBool("isRunning") ?? true
        let state = RestTimerAttributes.ContentState(
            startedAt: min(endsAt.addingTimeInterval(-durationSeconds), endsAt),
            endsAt: endsAt,
            isRunning: isRunning,
            remainingSeconds: call.getInt("remainingSeconds") ?? 0,
            label: call.getString("label")
        )
        let workoutId = call.getString("workoutId") ?? "workout"
        let content = ActivityContent(state: state, staleDate: nil)
        Task {
            if let existing = Activity<RestTimerAttributes>.activities.first {
                await existing.update(content)
            } else if ActivityAuthorizationInfo().areActivitiesEnabled {
                // Off in Settings or refused: the in-app timer and the scheduled alert still work.
                _ = try? Activity.request(
                    attributes: RestTimerAttributes(workoutId: workoutId), content: content, pushType: nil
                )
            }
            call.resolve()
        }
    }
}
