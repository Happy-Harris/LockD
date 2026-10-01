package com.happyharris.lockd;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.UUID;

/**
 * Receives the rest-timer notification buttons. The tap is written to the durable inbox first, so it survives the web
 * layer not running; the plugin is then told, and the web store applies it when it runs.
 */
public class LockScreenActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null || !action.startsWith(LockScreenTimerPlugin.ACTION_PREFIX)) return;
        String name = action.substring(LockScreenTimerPlugin.ACTION_PREFIX.length());
        String word;
        switch (name) {
            case "PLUS":
                word = "plus";
                break;
            case "MINUS":
                word = "minus";
                break;
            case "STOP":
                word = "stop";
                break;
            default:
                return;
        }
        PendingActionStore.enqueue(context, UUID.randomUUID().toString(), System.currentTimeMillis(), word);
        LockScreenTimerPlugin.announce();
    }
}
