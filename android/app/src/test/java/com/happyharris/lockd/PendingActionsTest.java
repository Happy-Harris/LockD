package com.happyharris.lockd;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class PendingActionsTest {
    private static PendingActions.Item item(String id, long ms, String action) {
        return new PendingActions.Item(id, ms, action);
    }

    @Test
    public void aTapSurvivesTheRoundTripWithItsTime() {
        String stored = PendingActions.append("", item("a", 1_700_000_000_123L, "plus"));
        List<PendingActions.Item> items = PendingActions.parse(stored);
        assertEquals(1, items.size());
        assertEquals("a", items.get(0).id);
        assertEquals(1_700_000_000_123L, items.get(0).receivedAtMs);
        assertEquals("plus", items.get(0).action);
    }

    @Test
    public void aTapDeliveredTwiceIsKeptOnce() {
        String stored = PendingActions.append("", item("a", 1, "stop"));
        stored = PendingActions.append(stored, item("a", 2, "stop"));
        assertEquals(1, PendingActions.parse(stored).size());
    }

    @Test
    public void acknowledgingRemovesOnlyTheNamedTaps() {
        String stored = "";
        stored = PendingActions.append(stored, item("a", 1, "plus"));
        stored = PendingActions.append(stored, item("b", 2, "minus"));
        stored = PendingActions.append(stored, item("c", 3, "stop"));
        stored = PendingActions.remove(stored, Arrays.asList("a", "c", "unknown"));
        List<PendingActions.Item> left = PendingActions.parse(stored);
        assertEquals(1, left.size());
        assertEquals("b", left.get(0).id);
    }

    @Test
    public void aDamagedLineIsSkippedAndTheRestIsKept() {
        String stored = "a\t1\tplus\nnot a line\nb\tNaN\tstop\nc\t3\tstop";
        List<PendingActions.Item> items = PendingActions.parse(stored);
        assertEquals(2, items.size());
        assertEquals("a", items.get(0).id);
        assertEquals("c", items.get(1).id);
    }

    @Test
    public void theOldestAreDroppedBeyondTheCapacity() {
        String stored = "";
        for (int i = 0; i < PendingActions.CAPACITY + 5; i++) {
            stored = PendingActions.append(stored, item("id" + i, i, "plus"));
        }
        List<PendingActions.Item> items = PendingActions.parse(stored);
        assertEquals(PendingActions.CAPACITY, items.size());
        assertEquals("id5", items.get(0).id);
        assertTrue(items.get(items.size() - 1).id.endsWith(String.valueOf(PendingActions.CAPACITY + 4)));
    }

    @Test
    public void anEmptyOrMissingQueueParsesToNothing() {
        assertEquals(0, PendingActions.parse("").size());
        assertEquals(0, PendingActions.parse(null).size());
    }
}
