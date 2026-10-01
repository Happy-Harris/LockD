package com.happyharris.lockd;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * The Android half of the lock-screen rest timer (Opp 6, docs/design/lock-screen-rest-timer.md).
 *
 * The web store owns the timer. This plugin only draws it: an ongoing notification with the system chronometer
 * counting down to `endsAtMs`, so nothing here counts. Its minus, plus and stop buttons are sent back to the web
 * layer as an `action` event, and the store writes the new timestamps. The end-of-rest alert is a separate
 * scheduled notification (the local-notifications plugin).
 */
@CapacitorPlugin(name = "LockScreenTimer")
public class LockScreenTimerPlugin extends Plugin {
    static final String CHANNEL_ID = "lockd_rest_timer";
    static final int NOTIFICATION_ID = 4202;
    static final String ACTION_PREFIX = "com.happyharris.lockd.REST_";
    private static final long STEP_DONE_LINGER_MS = 60_000L;

    private static WeakReference<LockScreenTimerPlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
        ensureChannel(getContext());
    }

    /** Tells the web layer, if it is running, that a tap is waiting. A hint only: the inbox is the truth. */
    static void announce() {
        LockScreenTimerPlugin plugin = instance.get();
        if (plugin == null) return;
        plugin.notifyListeners("pending", new JSObject());
    }

    @PluginMethod
    public void pendingActions(PluginCall call) {
        JSArray items = new JSArray();
        for (PendingActions.Item item : PendingActionStore.items(getContext())) {
            JSObject payload = new JSObject();
            payload.put("action", item.action);
            JSObject entry = new JSObject();
            entry.put("id", item.id);
            entry.put("receivedAtMs", item.receivedAtMs);
            entry.put("payload", payload);
            items.put(entry);
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    @PluginMethod
    public void acknowledgeActions(PluginCall call) {
        List<String> ids = new ArrayList<>();
        try {
            JSArray raw = call.getArray("ids");
            if (raw != null) {
                for (int i = 0; i < raw.length(); i++) ids.add(raw.getString(i));
            }
        } catch (JSONException e) {
            call.reject("ids must be strings");
            return;
        }
        PendingActionStore.remove(getContext(), ids);
        call.resolve();
    }

    @PluginMethod
    public void show(PluginCall call) {
        post(call);
    }

    @PluginMethod
    public void update(PluginCall call) {
        post(call);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private void post(PluginCall call) {
        Context context = getContext();
        Long endsAtMs = call.getData().has("endsAtMs") ? call.getData().optLong("endsAtMs") : null;
        if (endsAtMs == null) {
            call.reject("endsAtMs is required");
            return;
        }
        boolean isRunning = Boolean.TRUE.equals(call.getBoolean("isRunning", true));
        long remaining = call.getData().optLong("remainingSeconds", 0);
        String label = call.getString("label");
        long now = System.currentTimeMillis();
        RestTimerFormat.State state = RestTimerFormat.stateOf(isRunning, endsAtMs, now);

        // Without the permission the in-app timer and the scheduled alert still work; the tile is skipped.
        boolean allowed = Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        if (!allowed) {
            call.resolve();
            return;
        }

        ensureChannel(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_rest)
            .setContentTitle(RestTimerFormat.title(label))
            .setContentText(RestTimerFormat.body(state, remaining))
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openApp(context));
        if (state == RestTimerFormat.State.RUNNING) {
            builder.setOngoing(true).setShowWhen(true).setWhen(endsAtMs).setUsesChronometer(true).setChronometerCountDown(true);
            builder.addAction(0, "−15 s", button(context, "MINUS"));
            builder.addAction(0, "+15 s", button(context, "PLUS"));
            builder.addAction(0, "Stop", button(context, "STOP"));
        } else if (state == RestTimerFormat.State.PAUSED) {
            builder.setOngoing(true).setShowWhen(false);
            builder.addAction(0, "Stop", button(context, "STOP"));
        } else {
            builder.setOngoing(false).setShowWhen(false).setTimeoutAfter(STEP_DONE_LINGER_MS);
        }
        Notification notification = builder.build();
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification);
        call.resolve();
    }

    private static PendingIntent button(Context context, String name) {
        Intent intent = new Intent(context, LockScreenActionReceiver.class).setAction(ACTION_PREFIX + name);
        return PendingIntent.getBroadcast(context, name.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Rest timer", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows the rest countdown on the lock screen");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}
