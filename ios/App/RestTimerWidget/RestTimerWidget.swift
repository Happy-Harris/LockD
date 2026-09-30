import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}

/// The rest clock. A running timer is drawn by the system from `endsAt`, so it counts down with the app suspended.
struct RestClock: View {
    let state: RestTimerAttributes.ContentState

    var body: some View {
        Group {
            if !state.isRunning {
                Text(clock(state.remainingSeconds))
            } else if state.endsAt <= Date() {
                Text("Rest done")
            } else {
                Text(timerInterval: Date.now...state.endsAt, countsDown: true)
            }
        }
        .monospacedDigit()
    }

    private func clock(_ seconds: Int) -> String {
        let safe = max(0, seconds)
        return String(format: "%d:%02d", safe / 60, safe % 60)
    }
}

struct RestButtons: View {
    let state: RestTimerAttributes.ContentState

    var body: some View {
        if #available(iOS 17.0, *) {
            HStack(spacing: 12) {
                if state.isRunning {
                    Button(intent: RestTimerActionIntent(action: "minus")) { Text("\u{2212}15 s") }
                    Button(intent: RestTimerActionIntent(action: "plus")) { Text("+15 s") }
                }
                Button(intent: RestTimerActionIntent(action: "stop")) { Text("Stop") }
            }
            .buttonStyle(.bordered)
        }
    }
}

struct RestTimerLockScreenView: View {
    let state: RestTimerAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(state.label ?? "Rest").font(.headline)
                Spacer()
                RestClock(state: state).font(.title2.bold())
            }
            RestButtons(state: state)
        }
        .padding()
    }
}

struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            RestTimerLockScreenView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.label ?? "Rest").font(.headline)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RestClock(state: context.state).font(.title2.bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    RestButtons(state: context.state)
                }
            } compactLeading: {
                Text("Rest")
            } compactTrailing: {
                RestClock(state: context.state).frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}
