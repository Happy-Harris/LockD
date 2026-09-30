package com.happyharris.lockd;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class RestTimerFormatTest {
    @Test
    public void clockFormatsMinutesAndSeconds() {
        assertEquals("1:30", RestTimerFormat.clock(90));
        assertEquals("0:05", RestTimerFormat.clock(5));
        assertEquals("0:00", RestTimerFormat.clock(-3));
    }

    @Test
    public void stateFollowsTheTimerNotACounter() {
        assertEquals(RestTimerFormat.State.RUNNING, RestTimerFormat.stateOf(true, 2000, 1000));
        assertEquals(RestTimerFormat.State.DONE, RestTimerFormat.stateOf(true, 1000, 1000));
        assertEquals(RestTimerFormat.State.PAUSED, RestTimerFormat.stateOf(false, 5000, 1000));
    }

    @Test
    public void wordingNamesWhatIsKnown() {
        assertEquals("Rest", RestTimerFormat.title(null));
        assertEquals("Bench Press", RestTimerFormat.title("Bench Press"));
        assertEquals("Paused, 0:45 left", RestTimerFormat.body(RestTimerFormat.State.PAUSED, 45));
        assertEquals("Rest done", RestTimerFormat.body(RestTimerFormat.State.DONE, 0));
    }
}
