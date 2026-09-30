import ActivityKit
import Foundation

/// What the Live Activity shows. The web store owns the timer; this is only the picture of it the phone draws.
/// Shared by the app and the widget extension.
@available(iOS 16.2, *)
public struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var startedAt: Date
        public var endsAt: Date
        public var isRunning: Bool
        /// Whole seconds left when paused; the phone shows this instead of counting down.
        public var remainingSeconds: Int
        public var label: String?

        public init(startedAt: Date, endsAt: Date, isRunning: Bool, remainingSeconds: Int, label: String?) {
            self.startedAt = startedAt
            self.endsAt = endsAt
            self.isRunning = isRunning
            self.remainingSeconds = remainingSeconds
            self.label = label
        }
    }

    public var workoutId: String

    public init(workoutId: String) {
        self.workoutId = workoutId
    }
}
