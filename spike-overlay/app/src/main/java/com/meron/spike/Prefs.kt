package com.meron.spike

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** One event's alarm as currently armed, persisted so it can be re-armed after a reboot. */
data class ArmedReminder(
    val id: String,
    val title: String,
    val startMs: Long,
    val reminderAtMs: Long,
    val noSnoozeAfterMinutes: Int,
    val requestCode: Int,
)

/**
 * Tiny SharedPreferences wrapper.
 *
 * The fire log is the point of the whole spike: it is the evidence that alarms were still firing
 * on day three. Without it we would be relying on someone happening to be looking at the phone.
 */
object Prefs {

    private const val FILE = "spike_prefs"
    private const val KEY_SOAK_ENABLED = "soak_enabled"
    private const val KEY_SOAK_INTERVAL = "soak_interval_minutes"
    private const val KEY_FIRE_LOG = "fire_log"
    private const val KEY_NEXT_FIRE = "next_fire_at"
    private const val KEY_TOKEN = "board_token"
    private const val KEY_SYNC_INTERVAL = "sync_interval_minutes"
    private const val KEY_LAST_SYNC_AT = "last_sync_at"
    private const val KEY_LAST_SYNC_ERROR = "last_sync_error"
    private const val KEY_ARMED_REMINDERS = "armed_reminders"

    private const val MAX_LOG_ENTRIES = 500
    private const val DEFAULT_SYNC_INTERVAL_MINUTES = 20

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun isSoakEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_SOAK_ENABLED, false)

    fun setSoakEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_SOAK_ENABLED, enabled).apply()
    }

    fun soakIntervalMinutes(context: Context): Int =
        prefs(context).getInt(KEY_SOAK_INTERVAL, 30)

    fun setSoakIntervalMinutes(context: Context, minutes: Int) {
        prefs(context).edit().putInt(KEY_SOAK_INTERVAL, minutes).apply()
    }

    fun nextFireAt(context: Context): Long =
        prefs(context).getLong(KEY_NEXT_FIRE, 0L)

    fun setNextFireAt(context: Context, atMillis: Long) {
        prefs(context).edit().putLong(KEY_NEXT_FIRE, atMillis).apply()
    }

    /** Append a timestamp to the fire log, trimming the oldest entries past the cap. */
    fun logFire(context: Context, atMillis: Long) {
        val array = readLogArray(context)
        array.put(atMillis)

        val trimmed = if (array.length() > MAX_LOG_ENTRIES) {
            JSONArray().also { out ->
                for (i in (array.length() - MAX_LOG_ENTRIES) until array.length()) {
                    out.put(array.getLong(i))
                }
            }
        } else {
            array
        }

        prefs(context).edit().putString(KEY_FIRE_LOG, trimmed.toString()).apply()
    }

    fun fireLog(context: Context): List<Long> {
        val array = readLogArray(context)
        return (0 until array.length()).map { array.getLong(it) }
    }

    fun clearFireLog(context: Context) {
        prefs(context).edit().remove(KEY_FIRE_LOG).apply()
    }

    private fun readLogArray(context: Context): JSONArray {
        val raw = prefs(context).getString(KEY_FIRE_LOG, null) ?: return JSONArray()
        return runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
    }

    // ── Calendar sync ──────────────────────────────────────────────────────────────────

    /** The signed per-kid dashboard token (same one used for the web board link). */
    fun token(context: Context): String? = prefs(context).getString(KEY_TOKEN, null)

    fun setToken(context: Context, token: String?) {
        prefs(context).edit().putString(KEY_TOKEN, token?.trim()?.ifEmpty { null }).apply()
    }

    fun syncIntervalMinutes(context: Context): Int =
        prefs(context).getInt(KEY_SYNC_INTERVAL, DEFAULT_SYNC_INTERVAL_MINUTES)

    fun setSyncIntervalMinutes(context: Context, minutes: Int) {
        prefs(context).edit().putInt(KEY_SYNC_INTERVAL, minutes).apply()
    }

    fun lastSyncAt(context: Context): Long = prefs(context).getLong(KEY_LAST_SYNC_AT, 0L)

    /** Records a successful sync: stamps the time and clears any previous error. */
    fun setLastSyncSuccess(context: Context, atMillis: Long) {
        prefs(context).edit()
            .putLong(KEY_LAST_SYNC_AT, atMillis)
            .remove(KEY_LAST_SYNC_ERROR)
            .apply()
    }

    fun lastSyncError(context: Context): String? = prefs(context).getString(KEY_LAST_SYNC_ERROR, null)

    fun setLastSyncError(context: Context, message: String) {
        prefs(context).edit().putString(KEY_LAST_SYNC_ERROR, message).apply()
    }

    /** The reminders currently armed as of the last successful sync. */
    fun armedReminders(context: Context): List<ArmedReminder> {
        val raw = prefs(context).getString(KEY_ARMED_REMINDERS, null) ?: return emptyList()
        val array = runCatching { JSONArray(raw) }.getOrElse { return emptyList() }
        return (0 until array.length()).mapNotNull { i ->
            runCatching {
                val o = array.getJSONObject(i)
                ArmedReminder(
                    id = o.getString("id"),
                    title = o.getString("title"),
                    startMs = o.getLong("startMs"),
                    reminderAtMs = o.getLong("reminderAtMs"),
                    noSnoozeAfterMinutes = o.getInt("noSnoozeAfterMinutes"),
                    requestCode = o.getInt("requestCode"),
                )
            }.getOrNull()
        }
    }

    fun setArmedReminders(context: Context, reminders: List<ArmedReminder>) {
        val array = JSONArray()
        for (r in reminders) {
            array.put(
                JSONObject()
                    .put("id", r.id)
                    .put("title", r.title)
                    .put("startMs", r.startMs)
                    .put("reminderAtMs", r.reminderAtMs)
                    .put("noSnoozeAfterMinutes", r.noSnoozeAfterMinutes)
                    .put("requestCode", r.requestCode)
            )
        }
        prefs(context).edit().putString(KEY_ARMED_REMINDERS, array.toString()).apply()
    }
}
