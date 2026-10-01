package com.happyharris.lockd;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The persisted text of the lock-screen button inbox, and nothing else: pure, so it is unit tested without a device.
 * One tap per line, `id TAB receivedAtMs TAB action`. The web store applies each tap and then acknowledges it; until
 * then it stays here, even if the app was killed. The phone's store stays the only writer of the log and the timer.
 */
final class PendingActions {
    /** More than this and the oldest are dropped. Far beyond anything tapped between two looks at the phone. */
    static final int CAPACITY = 200;

    static final class Item {
        final String id;
        final long receivedAtMs;
        final String action;

        Item(String id, long receivedAtMs, String action) {
            this.id = id;
            this.receivedAtMs = receivedAtMs;
            this.action = action;
        }
    }

    private PendingActions() {}

    static List<Item> parse(String stored) {
        List<Item> items = new ArrayList<>();
        if (stored == null || stored.isEmpty()) return items;
        for (String line : stored.split("\n")) {
            String[] parts = line.split("\t");
            if (parts.length != 3 || parts[0].isEmpty()) continue;
            try {
                items.add(new Item(parts[0], Long.parseLong(parts[1]), parts[2]));
            } catch (NumberFormatException ignored) {
                // A damaged line is skipped; the rest of the queue is kept.
            }
        }
        return items;
    }

    static String encode(List<Item> items) {
        StringBuilder out = new StringBuilder();
        for (Item item : items) {
            if (out.length() > 0) out.append('\n');
            out.append(item.id).append('\t').append(item.receivedAtMs).append('\t').append(item.action);
        }
        return out.toString();
    }

    /** Adds a tap. A tap whose id is already queued is kept once. */
    static String append(String stored, Item item) {
        List<Item> items = parse(stored);
        for (Item existing : items) {
            if (existing.id.equals(item.id)) return encode(items);
        }
        items.add(item);
        while (items.size() > CAPACITY) items.remove(0);
        return encode(items);
    }

    static String remove(String stored, Collection<String> ids) {
        Set<String> drop = new HashSet<>(ids);
        List<Item> kept = new ArrayList<>();
        for (Item item : parse(stored)) {
            if (!drop.contains(item.id)) kept.add(item);
        }
        return encode(kept);
    }
}
