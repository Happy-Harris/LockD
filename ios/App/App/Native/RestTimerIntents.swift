import AppIntents
import Foundation

extension Notification.Name {
    /// Posted in the app process when a Live Activity button is tapped. The plugin forwards it to the web layer.
    static let lockdRestTimerAction = Notification.Name("lockd.restTimerAction")
}

/// A Live Activity button: minus 15 s, plus 15 s or stop. It edits nothing itself; the web store writes the new
/// timestamps and pushes the update. Shared by the app and the widget extension.
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
        NotificationCenter.default.post(name: .lockdRestTimerAction, object: nil, userInfo: ["action": action])
        return .result()
    }
}
