package com.meron.spike

import android.content.Context
import org.json.JSONArray

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

    private const val MAX_LOG_ENTRIES = 500

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
}
