import Foundation

struct SleepInterval: Equatable {
    var start: Date
    var end: Date
}

enum SleepIntervals {
    /// Overlapping or touching intervals joined into one. Two sources (a phone and a watch) can both record the same
    /// hour of sleep; counting each would double the night.
    static func merged(_ intervals: [SleepInterval]) -> [SleepInterval] {
        let sorted = intervals.filter { $0.end > $0.start }.sorted { $0.start < $1.start }
        var out: [SleepInterval] = []
        for interval in sorted {
            if let last = out.last, interval.start <= last.end {
                out[out.count - 1].end = max(last.end, interval.end)
            } else {
                out.append(interval)
            }
        }
        return out
    }
}
