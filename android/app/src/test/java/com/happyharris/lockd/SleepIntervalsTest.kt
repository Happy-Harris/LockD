package com.happyharris.lockd

import org.junit.Assert.assertEquals
import org.junit.Test

class SleepIntervalsTest {
    @Test
    fun overlappingSourcesAreCountedOnce() {
        val merged = SleepIntervals.merged(
            listOf(SleepInterval(0, 3_600_000), SleepInterval(1_800_000, 5_400_000), SleepInterval(9_000_000, 9_600_000))
        )
        assertEquals(listOf(SleepInterval(0, 5_400_000), SleepInterval(9_000_000, 9_600_000)), merged)
    }

    @Test
    fun touchingIntervalsJoinAndEmptyOnesDrop() {
        val merged = SleepIntervals.merged(listOf(SleepInterval(0, 10), SleepInterval(10, 20), SleepInterval(30, 30)))
        assertEquals(listOf(SleepInterval(0, 20)), merged)
    }

    @Test
    fun unsortedInputIsHandled() {
        val merged = SleepIntervals.merged(listOf(SleepInterval(50, 60), SleepInterval(0, 10)))
        assertEquals(listOf(SleepInterval(0, 10), SleepInterval(50, 60)), merged)
    }
}
