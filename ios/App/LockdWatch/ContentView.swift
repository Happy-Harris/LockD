import SwiftUI

struct ContentView: View {
    @EnvironmentObject var model: WatchModel

    var body: some View {
        Group {
            if let snapshot = model.snapshot {
                TabView {
                    SetView(snapshot: snapshot)
                    if let target = snapshot.display?.target, let why = snapshot.nextTarget?.why {
                        TargetView(target: target, why: why)
                    }
                }
                .tabViewStyle(.page)
            } else {
                Text("Start a workout on your phone")
                    .multilineTextAlignment(.center)
                    .padding()
            }
        }
    }
}

struct SetView: View {
    @EnvironmentObject var model: WatchModel
    let snapshot: WatchSnapshot

    private var restEnd: Date? {
        guard let rest = snapshot.rest, rest.isRunning, let end = rest.endDate, end > Date() else { return nil }
        return end
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text(snapshot.exerciseName).font(.headline).multilineTextAlignment(.center)
                if let record = snapshot.record {
                    Text(record).font(.caption.bold()).foregroundStyle(.yellow)
                }
                if let set = snapshot.set {
                    Text(setTitle(set)).font(.caption2).foregroundStyle(.secondary)
                    Text(snapshot.display?.load ?? "Nothing entered yet").font(.title3.bold()).multilineTextAlignment(.center)
                    if let previous = snapshot.display?.previous {
                        Text("Last: \(previous)").font(.caption2).foregroundStyle(.secondary)
                    }
                    // Not "done" until the phone confirms: the button says it is waiting and cannot be tapped twice.
                    Button(model.isWaiting(setId: set.setId) ? "Waiting for phone\u{2026}" : "Complete") {
                        model.send(.completeSet(setId: set.setId))
                    }
                    .disabled(!model.phoneReachable || model.isWaiting(setId: set.setId))
                } else {
                    Text("All sets done").font(.title3)
                }
                if !model.phoneReachable {
                    Text("Phone not reachable").font(.caption2).foregroundStyle(.orange)
                }
                if let notice = model.notice {
                    Text(notice).font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
                }
                restControls
            }
        }
    }

    @ViewBuilder
    private var restControls: some View {
        if let rest = snapshot.rest {
            VStack(spacing: 4) {
                if let end = restEnd {
                    Text(timerInterval: Date.now...end, countsDown: true).font(.title2.monospacedDigit())
                } else if !rest.isRunning {
                    Text("Paused, \(clock(rest.remainingSeconds))").font(.title3.monospacedDigit())
                } else {
                    Text("Rest done").font(.title3)
                }
                HStack {
                    Button("\u{2212}15") { model.send(.adjustRest(deltaSeconds: -15)) }
                    Button("+15") { model.send(.adjustRest(deltaSeconds: 15)) }
                }
                Button("Stop") { model.send(.stopRest) }
            }
            .disabled(!model.phoneReachable || model.isWaitingOnRest)
        }
    }

    private func setTitle(_ set: WatchSnapshot.SetLine) -> String {
        if set.setType == "warmup" { return "Warm-up" }
        let side = set.side.map { ", \($0)" } ?? ""
        return "Set \(set.setNumber) of \(set.setCount)\(side)"
    }

    private func clock(_ seconds: Int) -> String {
        let safe = max(0, seconds)
        return String(format: "%d:%02d", safe / 60, safe % 60)
    }
}

struct TargetView: View {
    let target: String
    let why: String

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("Next target").font(.caption2).foregroundStyle(.secondary)
                Text(target).font(.title3.bold())
                Text(why).font(.caption2).multilineTextAlignment(.center)
            }
            .padding()
        }
    }
}
