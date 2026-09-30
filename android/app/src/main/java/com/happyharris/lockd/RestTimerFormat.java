package com.happyharris.lockd;

import java.util.Locale;

/** Pure wording for the lock-screen rest timer, kept apart from Android so it can be unit tested. */
final class RestTimerFormat {
    private RestTimerFormat() {}

    /** "1:30" for 90 seconds; never negative. */
    static String clock(long seconds) {
        long safe = Math.max(0, seconds);
        return String.format(Locale.US, "%d:%02d", safe / 60, safe % 60);
    }

    enum State { RUNNING, PAUSED, DONE }

    static State stateOf(boolean isRunning, long endsAtMs, long nowMs) {
        if (!isRunning) return State.PAUSED;
        return endsAtMs <= nowMs ? State.DONE : State.RUNNING;
    }

    static String title(String label) {
        return label == null || label.isEmpty() ? "Rest" : label;
    }

    static String body(State state, long remainingSeconds) {
        switch (state) {
            case PAUSED:
                return "Paused, " + clock(remainingSeconds) + " left";
            case DONE:
                return "Rest done";
            default:
                return "Rest";
        }
    }
}
