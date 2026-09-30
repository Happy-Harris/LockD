package com.happyharris.lockd;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Receives the rest-timer notification buttons and hands them to the plugin. */
public class LockScreenActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null || !action.startsWith(LockScreenTimerPlugin.ACTION_PREFIX)) return;
        String name = action.substring(LockScreenTimerPlugin.ACTION_PREFIX.length());
        switch (name) {
            case "PLUS":
                LockScreenTimerPlugin.dispatch("plus");
                break;
            case "MINUS":
                LockScreenTimerPlugin.dispatch("minus");
                break;
            case "STOP":
                LockScreenTimerPlugin.dispatch("stop");
                break;
            default:
                break;
        }
    }
}
