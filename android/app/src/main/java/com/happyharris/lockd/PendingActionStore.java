package com.happyharris.lockd;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Collection;
import java.util.List;

/** Keeps the lock-screen button inbox (see {@link PendingActions}) in the app's private preferences. */
final class PendingActionStore {
    private static final String PREFS = "lockd_pending_actions";
    private static final String KEY = "restTimer";

    private PendingActionStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Written with commit(), not apply(): the receiver's process may be killed right after it returns. */
    static synchronized void enqueue(Context context, String id, long receivedAtMs, String action) {
        SharedPreferences p = prefs(context);
        p.edit().putString(KEY, PendingActions.append(p.getString(KEY, ""), new PendingActions.Item(id, receivedAtMs, action))).commit();
    }

    static synchronized List<PendingActions.Item> items(Context context) {
        return PendingActions.parse(prefs(context).getString(KEY, ""));
    }

    static synchronized void remove(Context context, Collection<String> ids) {
        SharedPreferences p = prefs(context);
        p.edit().putString(KEY, PendingActions.remove(p.getString(KEY, ""), ids)).commit();
    }
}
