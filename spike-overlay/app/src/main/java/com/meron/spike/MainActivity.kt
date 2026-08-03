package com.meron.spike

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Debug console for the spike. Not a real UI — it exists to arm alarms by hand and, crucially,
 * to show the fire log so the three-day soak can be verified at a glance days later.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.grantOverlay).setOnClickListener {
            startActivity(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName"),
                )
            )
        }

        findViewById<Button>(R.id.grantExactAlarm).setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                startActivity(
                    Intent(
                        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:$packageName"),
                    )
                )
            }
        }

        findViewById<Button>(R.id.grantNotifications).setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            }
        }

        findViewById<Button>(R.id.appSettings).setOnClickListener {
            startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:$packageName"),
                )
            )
        }

        // One minute out, with a 20-minute "lesson" — snooze should be offered.
        findViewById<Button>(R.id.fireSnoozeable).setOnClickListener {
            val now = System.currentTimeMillis()
            AlarmScheduler.schedule(
                context = this,
                triggerAtMillis = now + 60_000L,
                title = "שיעור גיטרה",
                startAtMillis = now + 60_000L + 20 * 60_000L,
                noSnoozeAfterMinutes = 10,
            )
            refresh()
        }

        // Deadline already inside the no-snooze window — snooze must be hidden.
        findViewById<Button>(R.id.fireFinal).setOnClickListener {
            val now = System.currentTimeMillis()
            AlarmScheduler.schedule(
                context = this,
                triggerAtMillis = now + 60_000L,
                title = "אימון בדמינטון",
                startAtMillis = now + 60_000L + 5 * 60_000L,
                noSnoozeAfterMinutes = 30,
            )
            refresh()
        }

        findViewById<Button>(R.id.startSoak).setOnClickListener {
            Prefs.setSoakEnabled(this, true)
            val now = System.currentTimeMillis()
            val intervalMs = Prefs.soakIntervalMinutes(this) * 60_000L
            AlarmScheduler.schedule(
                context = this,
                triggerAtMillis = now + intervalMs,
                title = "בדיקת עומס",
                startAtMillis = now + intervalMs + 20 * 60_000L,
                noSnoozeAfterMinutes = 10,
                isSoak = true,
            )
            refresh()
        }

        findViewById<Button>(R.id.stopSoak).setOnClickListener {
            Prefs.setSoakEnabled(this, false)
            AlarmScheduler.cancel(this)
            refresh()
        }

        findViewById<Button>(R.id.clearLog).setOnClickListener {
            Prefs.clearFireLog(this)
            refresh()
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val overlayOk = Settings.canDrawOverlays(this)
        val exactOk = AlarmScheduler.canScheduleExact(this)
        val notifyOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        findViewById<TextView>(R.id.status).text = buildString {
            appendLine("${tick(overlayOk)}  הרשאת חלון מעל אפליקציות")
            appendLine("${tick(exactOk)}  התראות מדויקות")
            appendLine("${tick(notifyOk)}  הרשאת התראות")
        }.trim()

        val log = Prefs.fireLog(this)
        val nextAt = Prefs.nextFireAt(this)

        findViewById<TextView>(R.id.soakStatus).text = buildString {
            appendLine("בדיקת עומס: ${if (Prefs.isSoakEnabled(this@MainActivity)) "פעילה" else "כבויה"}")
            appendLine("מספר הפעלות: ${log.size}")
            appendLine("הפעלה אחרונה: ${log.lastOrNull()?.let { stamp(it) } ?: "—"}")
            appendLine("הפעלה ראשונה: ${log.firstOrNull()?.let { stamp(it) } ?: "—"}")
            appendLine("הבאה בתור: ${if (nextAt > 0) stamp(nextAt) else "—"}")
        }.trim()

        findViewById<TextView>(R.id.recent).text = log
            .takeLast(12)
            .reversed()
            .joinToString("\n") { stamp(it) }
            .ifEmpty { "אין עדיין הפעלות" }
    }

    private fun tick(ok: Boolean) = if (ok) "✅" else "❌"

    private fun stamp(millis: Long) = STAMP_FORMAT.format(Date(millis))

    private companion object {
        val STAMP_FORMAT = SimpleDateFormat("dd/MM HH:mm:ss", Locale("he", "IL"))
    }
}
