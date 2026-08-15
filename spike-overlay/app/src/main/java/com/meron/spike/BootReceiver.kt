package com.meron.spike

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Alarms do not survive a reboot, so re-arm everything on boot and after an app update: the soak
 * alarm if that test is running, and — the real schedule — every reminder from the last
 * successful sync, plus a refresh sync shortly after in case the calendar changed while the phone
 * was off.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (Prefs.isSoakEnabled(context)) {
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

            Log.i(TAG, "Re-armed soak alarm after ${intent.action} for $nextAt")
        }

        if (!Prefs.token(context).isNullOrBlank()) {
            val now = System.currentTimeMillis()
            var rearmed = 0

            for (r in Prefs.armedReminders(context)) {
                if (r.startMs <= now) continue // already happened while the phone was off
                val triggerAt = maxOf(r.reminderAtMs, now + MIN_LEAD_MS)
                if (triggerAt >= r.startMs) continue // no longer a useful lead time

                AlarmScheduler.schedule(
                    context = context,
                    triggerAtMillis = triggerAt,
                    title = r.title,
                    startAtMillis = r.startMs,
                    noSnoozeAfterMinutes = r.noSnoozeAfterMinutes,
                    requestCode = r.requestCode,
                )
                rearmed++
            }

            AlarmScheduler.scheduleSync(context, now + BOOT_SYNC_DELAY_MS)
            Log.i(TAG, "Re-armed $rearmed reminder(s) and scheduled a refresh sync after ${intent.action}")
        }
    }

    private companion object {
        const val TAG = "SpikeBoot"
        const val MIN_LEAD_MS = 5_000L
        const val BOOT_SYNC_DELAY_MS = 60_000L
    }
}
