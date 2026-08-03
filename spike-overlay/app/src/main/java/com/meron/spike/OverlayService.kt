package com.meron.spike

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Draws the reminder card on top of whatever is currently on screen.
 *
 * Runs as a foreground service because the overlay has to survive the system deciding the app is
 * idle. If the overlay permission has been revoked we fall back to a full-screen notification —
 * degraded, but it beats the reminder vanishing silently.
 */
class OverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private var cardView: View? = null
    private var ringtone: Ringtone? = null
    private val handler = Handler(Looper.getMainLooper())
    private val autoDismiss = Runnable { dismiss("timeout") }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WindowManager::class.java)
        createChannels()
        startInForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "תזכורת"
        val startAt = intent?.getLongExtra(AlarmScheduler.EXTRA_START_AT, 0L) ?: 0L
        val noSnoozeAfterMinutes =
            intent?.getIntExtra(AlarmScheduler.EXTRA_NO_SNOOZE_AFTER_MIN, 5) ?: 5

        if (!Settings.canDrawOverlays(this)) {
            Log.w(TAG, "Overlay permission missing — falling back to a notification")
            showFallbackNotification(title, startAt)
            stopSelf()
            return START_NOT_STICKY
        }

        showCard(title, startAt, noSnoozeAfterMinutes)
        alert()

        handler.removeCallbacks(autoDismiss)
        handler.postDelayed(autoDismiss, AUTO_DISMISS_MS)

        return START_NOT_STICKY
    }

    private fun showCard(title: String, startAtMillis: Long, noSnoozeAfterMinutes: Int) {
        removeCard()

        val view = LayoutInflater.from(this).inflate(R.layout.overlay_card, null)

        view.findViewById<TextView>(R.id.title).text = title
        view.findViewById<TextView>(R.id.subtitle).text = if (startAtMillis > 0) {
            getString(R.string.starts_at, TIME_FORMAT.format(Date(startAtMillis)))
        } else {
            getString(R.string.leave_now)
        }

        view.findViewById<Button>(R.id.gotIt).setOnClickListener { dismiss("got_it") }

        val snoozeButton = view.findViewById<Button>(R.id.snooze)
        val msRemaining = startAtMillis - System.currentTimeMillis()
        val snoozeAllowed =
            startAtMillis > 0 && msRemaining > noSnoozeAfterMinutes * 60_000L

        if (snoozeAllowed) {
            snoozeButton.visibility = View.VISIBLE
            snoozeButton.setOnClickListener {
                AlarmScheduler.schedule(
                    context = this,
                    triggerAtMillis = System.currentTimeMillis() + SNOOZE_MS,
                    title = title,
                    startAtMillis = startAtMillis,
                    noSnoozeAfterMinutes = noSnoozeAfterMinutes,
                    requestCode = AlarmScheduler.REQUEST_SNOOZE,
                )
                dismiss("snooze")
            }
        } else {
            // Past the point where postponing is still safe: only "got it" remains.
            snoozeButton.visibility = View.GONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = android.view.Gravity.CENTER
        }

        runCatching {
            windowManager.addView(view, params)
            cardView = view
            Log.i(TAG, "Overlay shown: $title (snooze=$snoozeAllowed)")
        }.onFailure {
            Log.e(TAG, "addView failed", it)
            showFallbackNotification(title, startAtMillis)
            stopSelf()
        }
    }

    private fun alert() {
        runCatching {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ringtone = RingtoneManager.getRingtone(this, uri)?.apply {
                audioAttributes = AudioAttributes.Builder()
                    // USAGE_ALARM so it cuts through whatever the game is playing.
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                play()
            }
        }.onFailure { Log.w(TAG, "Could not play sound", it) }

        runCatching {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            vibrator.vibrate(
                VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400, 200, 600), -1)
            )
        }.onFailure { Log.w(TAG, "Could not vibrate", it) }
    }

    private fun dismiss(reason: String) {
        Log.i(TAG, "Overlay dismissed ($reason)")
        removeCard()
        stopSelf()
    }

    private fun removeCard() {
        handler.removeCallbacks(autoDismiss)
        ringtone?.runCatching { stop() }
        ringtone = null
        cardView?.let { view ->
            runCatching { windowManager.removeView(view) }
                .onFailure { Log.w(TAG, "removeView failed", it) }
        }
        cardView = null
    }

    override fun onDestroy() {
        removeCard()
        super.onDestroy()
    }

    private fun startInForeground() {
        val notification: Notification = Notification.Builder(this, CHANNEL_SERVICE)
            .setContentTitle(getString(R.string.service_running))
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID_SERVICE,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID_SERVICE, notification)
        }
    }

    /** Used when the overlay permission has been revoked, so something still reaches the kid. */
    private fun showFallbackNotification(title: String, startAtMillis: Long) {
        val text = if (startAtMillis > 0) {
            getString(R.string.starts_at, TIME_FORMAT.format(Date(startAtMillis)))
        } else {
            getString(R.string.leave_now)
        }

        val notification = Notification.Builder(this, CHANNEL_ALERT)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher)
            .setAutoCancel(true)
            .build()

        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID_FALLBACK, notification)
    }

    private fun createChannels() {
        val manager = getSystemService(NotificationManager::class.java)

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_SERVICE,
                getString(R.string.channel_service),
                NotificationManager.IMPORTANCE_LOW,
            )
        )

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ALERT,
                getString(R.string.channel_alert),
                NotificationManager.IMPORTANCE_HIGH,
            )
        )
    }

    private companion object {
        const val TAG = "SpikeOverlay"
        const val CHANNEL_SERVICE = "spike_service"
        const val CHANNEL_ALERT = "spike_alert"
        const val NOTIFICATION_ID_SERVICE = 1
        const val NOTIFICATION_ID_FALLBACK = 2
        const val AUTO_DISMISS_MS = 90_000L
        const val SNOOZE_MS = 5 * 60_000L
        val TIME_FORMAT = SimpleDateFormat("HH:mm", Locale("he", "IL"))
    }
}
