import Foundation

/// The phone's picture of the active workout, sent by the phone (src/lib/native/watch.ts, protocol version 1). The
/// watch draws it and runs no lifting maths: every weight arrives already written in the lifter's unit.
struct WatchSnapshot: Codable, Equatable {
    struct SetLine: Codable, Equatable {
        var setId: String
        var setNumber: Int
        var setCount: Int
        var setType: String
        var side: String?
    }

    struct NextTarget: Codable, Equatable {
        var why: String
    }

    struct Rest: Codable, Equatable {
        var endsAt: String
        var isRunning: Bool
        var remainingSeconds: Int
        var label: String?
    }

    struct Display: Codable, Equatable {
        var load: String?
        var previous: String?
        var target: String?
    }

    var version: Int
    var workoutId: String
    var workoutName: String
    var exerciseName: String
    var set: SetLine?
    var nextTarget: NextTarget?
    var unit: String
    var rest: Rest?
    var vibrate: Bool
    var display: Display?
    var record: String?
    var acks: [Ack]?

    /// What the phone did with one of the watch's taps, by the id the watch gave it.
    struct Ack: Codable, Equatable {
        var id: String
        var result: String
        var reason: String?
    }
}

extension WatchSnapshot.Rest {
    /// When the rest ends, read from the phone's ISO time. The watch counts down to this and never keeps its own clock.
    var endDate: Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: endsAt) ?? ISO8601DateFormatter().date(from: endsAt)
    }
}

/// What the watch sends back. The phone applies each one through the same store actions its own screen uses.
/// Every tap carries its own id (so a tap delivered twice is applied once and the phone can answer for it) and the
/// time it was made (so a tap that waits for the phone's app to run is recorded when it happened).
enum WatchIntent {
    case completeSet(setId: String)
    case adjustRest(deltaSeconds: Int)
    case stopRest

    var payload: [String: Any] {
        switch self {
        case .completeSet(let setId): return ["type": "completeSet", "setId": setId]
        case .adjustRest(let delta): return ["type": "adjustRest", "deltaSeconds": delta]
        case .stopRest: return ["type": "stopRest"]
        }
    }

    var kind: String {
        switch self {
        case .completeSet: return "completeSet"
        case .adjustRest: return "adjustRest"
        case .stopRest: return "stopRest"
        }
    }

    var setId: String? {
        if case .completeSet(let id) = self { return id }
        return nil
    }
}

/// A tap the watch has sent and the phone has not yet confirmed. The watch never shows it as done.
struct PendingTap: Equatable {
    let id: String
    let kind: String
    let setId: String?
    let sentAt: Date
}

/// Words for a tap the phone did not apply. Never worded as a success.
func droppedMessage(_ reason: String?) -> String {
    switch reason {
    case "stale": return "Not logged: that set had already moved on"
    case "no-workout": return "Not logged: no workout is active"
    case "no-timer": return "Not applied: no rest timer is running"
    case "superseded": return "Not applied: the rest timer had changed"
    case "expired": return "Not applied: the tap was too old"
    default: return "Not applied by the phone"
    }
}
