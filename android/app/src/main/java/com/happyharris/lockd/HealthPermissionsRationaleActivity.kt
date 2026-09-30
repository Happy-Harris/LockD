package com.happyharris.lockd

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/** Shown when Health Connect asks why Lock'd reads health data. */
class HealthPermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        setContentView(
            TextView(this).apply {
                setPadding(pad, pad, pad, pad)
                textSize = 16f
                text = "Lock'd reads your bodyweight, sleep and heart rate variability from Health Connect " +
                    "only to show them beside your training in the Chronicle. It never writes to Health Connect, " +
                    "never turns them into a score or advice, and you can switch each one off in Lock'd Settings. " +
                    "Bodyweight becomes an ordinary bodyweight entry and syncs with your account like one you typed. " +
                    "Sleep and heart rate variability stay on this device and in your backups."
            }
        )
    }
}
