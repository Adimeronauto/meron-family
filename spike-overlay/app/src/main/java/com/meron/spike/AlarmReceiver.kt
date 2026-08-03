package com.meron.spike

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Fires when an alarm goes off. Logs the event, shows the overlay, and — during a soak test —
 * arms the next one.
 *
 * Re-arming here rather than using setRepeating is deliberate: repeating alarms are inexact and
 * get batched, which would make the soak test measure the wrong thing.
 */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val firedAt = System.currentTimeMillis()
        Prefs.logFire(context, firedAt)

        val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "תזכורת"
        val startAt = intent.getLongExtra(AlarmScheduler.EXTRA_START_AT, firedAt)
        val noSnoozeAfter = intent.getIntExtra(AlarmScheduler.EXTRA_NO_SNOOZE_AFTER_MIN, 5)
        val isSoak = intent.getBooleanExtra(AlarmScheduler.EXTRA_IS_SOAK, false)

        Log.i(TAG, "Alarm fired at $firedAt (soak=$isSoak, title=$title)")

        val serviceIntent = Intent(context, OverlayService::class.java).apply {
            putExtra(AlarmScheduler.EXTRA_TITLE, title)
            putExtra(AlarmScheduler.EXTRA_START_AT, startAt)
            putExtra(AlarmScheduler.EXTRA_NO_SNOOZE_AFTER_MIN, noSnoozeAfter)
        }

        runCatching { ContextCompat.startForegroundService(context, serviceIntent) }
            .onFailure { Log.e(TAG, "Could not start overlay service", it) }

        if (isSoak && Prefs.isSoakEnabled(context)) {
            val intervalMinutes = Prefs.soakIntervalMinutes(context)
            val nextAt = firedAt + intervalMinutes * 60_000L
            AlarmScheduler.schedule(
                context = context,
                triggerAtMillis = nextAt,
                title = title,
                startAtMillis = nextAt + 20 * 60_000L,
                noSnoozeAfterMinutes = noSnoozeAfter,
                isSoak = true,
            )
            Log.i(TAG, "Soak: next alarm armed for $nextAt")
        }
    }

    private companion object {
        const val TAG = "SpikeAlarm"
    }
}
