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
}
