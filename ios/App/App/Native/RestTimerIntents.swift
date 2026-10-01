import AppIntents
import Foundation

/// A Live Activity button: minus 15 s, plus 15 s or stop. It edits nothing itself. The tap is written to a durable
/// inbox (so it survives the web layer not running) and the web store applies it, writes the new timestamps and
/// pushes the update; until then the Live Activity keeps showing the old time. Shared by the app and the widget
/// extension.
@available(iOS 17.0, *)
struct RestTimerActionIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Rest timer"

    @Parameter(title: "Action")
    var action: String

    init() {
        self.action = "stop"
    }

    init(action: String) {
        self.action = action
    }

    func perform() async throws -> some IntentResult {
        let store = PendingActionStore.restTimer
        store.enqueue(id: nil, receivedAtMs: Date().timeIntervalSince1970 * 1000, payload: ["action": action])
        store.announce()
        return .result()
    }
}
