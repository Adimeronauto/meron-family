package com.meron.spike

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Fetches the near-term reminder list from the backend and reconciles the phone's armed alarms
 * against it. Runs as a short-lived foreground service (dataSync) so the network call can safely
 * outlive the triggering broadcast, then always re-arms the next sync cycle before stopping —
 * sooner on failure, so a transient outage recovers quickly.
 *
 * Each cycle cancels every alarm armed by the previous cycle and re-arms fresh from the response,
 * rather than diffing old vs. new. Simple to reason about, and cheap at the scale of a handful of
 * events a day.
 */
class SyncService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startInForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Thread { runSync() }.start()
        return START_NOT_STICKY
    }

    private fun runSync() {
        val token = Prefs.token(this)
        if (token.isNullOrBlank()) {
            Log.w(TAG, "No token saved — nothing to sync")
            stopSelf()
            return
        }

        runCatching { fetchReminders(token) }
            .onSuccess { fetched ->
                applyReminders(fetched)
                Prefs.setLastSyncSuccess(this, System.currentTimeMillis())
                Log.i(TAG, "Synced ${fetched.size} reminder(s)")
                scheduleNext(Prefs.syncIntervalMinutes(this))
            }
            .onFailure { err ->
                Log.e(TAG, "Sync failed", err)
                Prefs.setLastSyncError(this, err.message ?: err.javaClass.simpleName)
                scheduleNext(RETRY_MINUTES)
            }

        stopSelf()
    }

    private data class Fetched(
        val id: String,
        val title: String,
        val startMs: Long,
        val reminderAtMs: Long,
        val noSnoozeAfterMinutes: Int,
    )

    private fun fetchReminders(token: String): List<Fetched> {
        val url = URL("$BASE_URL/api/reminders?t=" + URLEncoder.encode(token, "UTF-8"))
        val conn = url.openConnection() as HttpURLConnection
        conn.connectTimeout = TIMEOUT_MS
        conn.readTimeout = TIMEOUT_MS
        conn.requestMethod = "GET"

        try {
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) throw RuntimeException("HTTP $code: $body")

            val json = JSONObject(body)
            if (!json.optBoolean("ok", false)) {
                throw RuntimeException(json.optString("error", "unknown error"))
            }

            val array = json.getJSONArray("reminders")
            return (0 until array.length()).map { i ->
                val o = array.getJSONObject(i)
                Fetched(
                    id = o.getString("id"),
                    title = o.getString("title"),
                    startMs = o.getLong("startMs"),
                    reminderAtMs = o.getLong("reminderAtMs"),
                    noSnoozeAfterMinutes = o.getInt("noSnoozeAfterMinutes"),
                )
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun applyReminders(fetched: List<Fetched>) {
        AlarmScheduler.cancelAll(this, Prefs.armedReminders(this).map { it.requestCode })

        val now = System.currentTimeMillis()
        val armed = mutableListOf<ArmedReminder>()

        for (r in fetched) {
            val requestCode = AlarmScheduler.requestCodeFor(r.id)
            val triggerAt = maxOf(r.reminderAtMs, now + MIN_LEAD_MS)
            if (triggerAt >= r.startMs) continue // too late for a useful reminder — skip it

            AlarmScheduler.schedule(
                context = this,
                triggerAtMillis = triggerAt,
                title = r.title,
                startAtMillis = r.startMs,
                noSnoozeAfterMinutes = r.noSnoozeAfterMinutes,
                requestCode = requestCode,
            )
            armed += ArmedReminder(
                id = r.id,
                title = r.title,
                startMs = r.startMs,
                reminderAtMs = r.reminderAtMs,
                noSnoozeAfterMinutes = r.noSnoozeAfterMinutes,
                requestCode = requestCode,
            )
        }

        Prefs.setArmedReminders(this, armed)
    }

    private fun scheduleNext(intervalMinutes: Int) {
        AlarmScheduler.scheduleSync(this, System.currentTimeMillis() + intervalMinutes * 60_000L)
    }

    private fun startInForeground() {
        val notification: Notification = Notification.Builder(this, CHANNEL_SYNC)
            .setContentTitle(getString(R.string.sync_running))
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_SYNC, getString(R.string.channel_sync), NotificationManager.IMPORTANCE_MIN)
        )
    }

    private companion object {
        const val TAG = "SpikeSync"
        const val CHANNEL_SYNC = "spike_sync"
        const val NOTIFICATION_ID = 3
        const val BASE_URL = "https://meron-family.vercel.app"
        const val TIMEOUT_MS = 15_000
        const val RETRY_MINUTES = 5
        const val MIN_LEAD_MS = 5_000L
    }
}
