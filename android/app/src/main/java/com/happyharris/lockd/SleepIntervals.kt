package com.happyharris.lockd

/** One stretch counted as asleep, in epoch milliseconds. */
data class SleepInterval(val startMs: Long, val endMs: Long)

object SleepIntervals {
    /**
     * Overlapping or touching intervals joined into one. Two sources (a phone and a watch) can both record the same
     * hour of sleep; counting each would double the night.
     */
    fun merged(intervals: List<SleepInterval>): List<SleepInterval> {
        val sorted = intervals.filter { it.endMs > it.startMs }.sortedBy { it.startMs }
        val out = ArrayList<SleepInterval>()
        for (interval in sorted) {
            val last = out.lastOrNull()
            if (last != null && interval.startMs <= last.endMs) {
                out[out.size - 1] = SleepInterval(last.startMs, maxOf(last.endMs, interval.endMs))
            } else {
                out.add(interval)
            }
        }
        return out
    }
}
