package com.meron.spike

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Fires on the self-rescheduling sync-cycle alarm (see [AlarmScheduler.scheduleSync]). Just
 * hands off to [SyncService] — the actual network fetch has to happen off this receiver's
 * main-thread callback.
 */
class SyncAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "Sync alarm fired")
        runCatching {
            ContextCompat.startForegroundService(context, Intent(context, SyncService::class.java))
        }.onFailure { Log.e(TAG, "Could not start sync service", it) }
    }

    private companion object {
        const val TAG = "SpikeSync"
    }
}
