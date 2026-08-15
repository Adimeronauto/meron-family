package com.meron.spike

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Schedules the reminder alarms.
 *
 * Uses [AlarmManager.setAlarmClock] rather than setExactAndAllowWhileIdle. It is the strongest
 * guarantee Android offers — the system treats it as a user-visible alarm and exempts it from
 * Doze batching entirely. On an aggressive OEM skin like HyperOS that difference is the whole
 * ballgame, which is exactly what the three-day soak is meant to prove.
 *
 * The visible cost is that Android shows an alarm icon in the status bar.
 */
object AlarmScheduler {

    const val REQUEST_MAIN = 1001
    const val REQUEST_SNOOZE = 1002
    const val REQUEST_SYNC = 1003

    // Synced calendar-event alarms each need their own request code so many can be armed at
    // once without clobbering each other (or the two manual test codes above). Offset well clear
    // of those fixed codes and derive deterministically from the Google Calendar event id, so the
    // same event always maps to the same code across sync cycles and app restarts.
    private const val REQUEST_EVENT_BASE = 10_000
    private const val REQUEST_EVENT_RANGE = 1_000_000

    fun requestCodeFor(eventId: String): Int {
        val h = eventId.hashCode() and 0x7fffffff // force non-negative
        return REQUEST_EVENT_BASE + (h % REQUEST_EVENT_RANGE)
    }

    const val EXTRA_TITLE = "title"
    const val EXTRA_START_AT = "start_at"
    const val EXTRA_NO_SNOOZE_AFTER_MIN = "no_snooze_after_min"
    const val EXTRA_IS_SOAK = "is_soak"

    fun schedule(
        context: Context,
        triggerAtMillis: Long,
        title: String,
        startAtMillis: Long,
        noSnoozeAfterMinutes: Int,
        isSoak: Boolean = false,
        requestCode: Int = REQUEST_MAIN,
    ) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)

        val fireIntent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_START_AT, startAtMillis)
            putExtra(EXTRA_NO_SNOOZE_AFTER_MIN, noSnoozeAfterMinutes)
            putExtra(EXTRA_IS_SOAK, isSoak)
        }

        val firePendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            fireIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val showPendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        if (canScheduleExact(context)) {
            alarmManager.setAlarmClock(
                AlarmManager.AlarmClockInfo(triggerAtMillis, showPendingIntent),
                firePendingIntent,
            )
        } else {
            // Degraded but still better than nothing; MainActivity nags for the permission.
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                firePendingIntent,
            )
        }

        Prefs.setNextFireAt(context, triggerAtMillis)
    }

    fun cancel(context: Context, requestCode: Int = REQUEST_MAIN) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, AlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        alarmManager.cancel(pendingIntent)
    }

    /** Cancel a batch of previously-scheduled event alarms (e.g. the whole set from the last sync). */
    fun cancelAll(context: Context, requestCodes: Collection<Int>) {
        requestCodes.forEach { cancel(context, it) }
    }

    /**
     * Arms the next sync cycle. Same [setAlarmClock] mechanism as event reminders, deliberately —
     * a periodic background sync is exactly the kind of work HyperOS aggressively throttles, so
     * the sync cycle re-arms itself through the one mechanism already proven to survive that.
     */
    fun scheduleSync(context: Context, triggerAtMillis: Long) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)

        val firePendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_SYNC,
            Intent(context, SyncAlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val showPendingIntent = PendingIntent.getActivity(
            context,
            REQUEST_SYNC,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        if (canScheduleExact(context)) {
            alarmManager.setAlarmClock(
                AlarmManager.AlarmClockInfo(triggerAtMillis, showPendingIntent),
                firePendingIntent,
            )
        } else {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                firePendingIntent,
            )
        }
    }

    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
    }
}
