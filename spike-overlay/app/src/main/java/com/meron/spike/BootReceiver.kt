package com.meron.spike

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Alarms do not survive a reboot, so re-arm the soak alarm on boot and after an app update.
 *
 * In the real app this is where the synced schedule gets re-applied.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (!Prefs.isSoakEnabled(context)) return

        val intervalMinutes = Prefs.soakIntervalMinutes(context)
        val nextAt = System.currentTimeMillis() + intervalMinutes * 60_000L

        AlarmScheduler.schedule(
            context = context,
            triggerAtMillis = nextAt,
            title = "בדיקת עומס",
            startAtMillis = nextAt + 20 * 60_000L,
            noSnoozeAfterMinutes = 10,
            isSoak = true,
        )

        Log.i("SpikeBoot", "Re-armed soak alarm after ${intent.action} for $nextAt")
    }
}
