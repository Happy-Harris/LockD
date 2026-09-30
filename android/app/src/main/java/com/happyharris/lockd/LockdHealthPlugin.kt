package com.happyharris.lockd

import android.app.Activity
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import kotlin.math.roundToLong
import kotlin.reflect.KClass
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The Android half of health context (Opp 10, docs/design/health-context.md): read-only bodyweight, sleep and heart
 * rate variability from Health Connect. Nothing is written back. Health Connect reports HRV as RMSSD, so every HRV
 * sample is labelled `rmssd` and is never compared with Apple Health's SDNN.
 *
 * The app's minSdk is 23 but the Health Connect client needs 26, so nothing here runs below Android 9.
 */
@CapacitorPlugin(name = "LockdHealth")
class LockdHealthPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private fun client(): HealthConnectClient? {
        if (Build.VERSION.SDK_INT < 28) return null
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) return null
        return HealthConnectClient.getOrCreate(context)
    }

    private fun recordType(type: String): KClass<out Record>? = when (type) {
        "bodyweight" -> WeightRecord::class
        "sleep" -> SleepSessionRecord::class
        "hrv" -> HeartRateVariabilityRmssdRecord::class
        else -> null
    }

    private fun permissionFor(type: String): String? =
        recordType(type)?.let { HealthPermission.getReadPermission(it) }

    private fun typesOf(call: PluginCall): List<String> {
        val array = call.getArray("types") ?: return emptyList()
        return (0 until array.length()).mapNotNull { array.optString(it, null) }
    }

    private fun grantedResult(types: List<String>, granted: Set<String>): JSObject {
        val allowed = JSArray()
        types.filter { type -> permissionFor(type)?.let { it in granted } == true }.forEach { allowed.put(it) }
        return JSObject().put("granted", allowed)
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        val types = typesOf(call)
        val health = client()
        if (health == null) {
            call.resolve(JSObject().put("granted", JSArray()))
            return
        }
        val wanted = types.mapNotNull { permissionFor(it) }.toSet()
        scope.launch {
            try {
                val granted = health.permissionController.getGrantedPermissions()
                if (wanted.isEmpty() || granted.containsAll(wanted)) {
                    call.resolve(grantedResult(types, granted))
                } else {
                    // Older than 30 days needs the history permission too; asking for it is harmless when refused.
                    val ask = wanted + HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
                    val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, ask)
                    startActivityForResult(call, intent, "permissionResult")
                }
            } catch (error: Exception) {
                call.reject(error.message ?: "Health Connect could not be reached")
            }
        }
    }

    @ActivityCallback
    private fun permissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val health = client()
        if (health == null) {
            call.resolve(JSObject().put("granted", JSArray()))
            return
        }
        scope.launch {
            try {
                // Ask Health Connect what is granted now rather than trusting the result intent.
                call.resolve(grantedResult(typesOf(call), health.permissionController.getGrantedPermissions()))
            } catch (error: Exception) {
                call.reject(error.message ?: "Health Connect could not be reached")
            }
        }
    }

    @PluginMethod
    fun read(call: PluginCall) {
        val types = typesOf(call)
        val since = call.getObject("since") ?: JSObject()
        val health = client()
        val out = JSObject()
            .put("bodyweight", JSArray())
            .put("sleep", JSArray())
            .put("hrv", JSArray())
        if (health == null) {
            call.resolve(out)
            return
        }
        scope.launch {
            try {
                val granted = health.permissionController.getGrantedPermissions()
                for (type in types) {
                    val permission = permissionFor(type)
                    if (permission == null || permission !in granted) continue
                    val from = parseInstant(since.optString(type, null))
                    when (type) {
                        "bodyweight" -> out.put("bodyweight", readBodyweight(health, from))
                        "sleep" -> out.put("sleep", readSleep(health, from))
                        "hrv" -> out.put("hrv", readHrv(health, from))
                    }
                }
                call.resolve(out)
            } catch (error: Exception) {
                call.reject(error.message ?: "Health Connect could not be read")
            }
        }
    }

    private suspend fun <T : Record> readAll(health: HealthConnectClient, type: KClass<T>, from: Instant): List<T> {
        val records = ArrayList<T>()
        var token: String? = null
        do {
            val response = health.readRecords(
                ReadRecordsRequest(type, TimeRangeFilter.after(from), pageToken = token)
            )
            records.addAll(response.records)
            token = response.pageToken
        } while (!token.isNullOrEmpty())
        return records
    }

    /** Without the history permission Health Connect refuses a start older than 30 days; fall back to what it allows. */
    private suspend fun <T : Record> readAllWithFallback(health: HealthConnectClient, type: KClass<T>, from: Instant): List<T> =
        try {
            readAll(health, type, from)
        } catch (error: SecurityException) {
            readAll(health, type, maxOf(from, Instant.now().minusSeconds(29L * 86_400)))
        }

    private suspend fun readBodyweight(health: HealthConnectClient, from: Instant): JSArray {
        val out = JSArray()
        for (record in readAllWithFallback(health, WeightRecord::class, from)) {
            out.put(
                JSObject()
                    .put("sourceId", record.metadata.id)
                    .put("grams", record.weight.inGrams.roundToLong())
                    .put("at", record.time.toString())
            )
        }
        return out
    }

    private suspend fun readHrv(health: HealthConnectClient, from: Instant): JSArray {
        val out = JSArray()
        for (record in readAllWithFallback(health, HeartRateVariabilityRmssdRecord::class, from)) {
            out.put(
                JSObject()
                    .put("sourceId", record.metadata.id)
                    .put("method", "rmssd")
                    .put("milliseconds", record.heartRateVariabilityMillis)
                    .put("at", record.time.toString())
            )
        }
        return out
    }

    private suspend fun readSleep(health: HealthConnectClient, from: Instant): JSArray {
        val asleep = ArrayList<SleepInterval>()
        for (session in readAllWithFallback(health, SleepSessionRecord::class, from)) {
            if (session.stages.isEmpty()) {
                // A session with no stages is the source saying "asleep for this long".
                asleep.add(SleepInterval(session.startTime.toEpochMilli(), session.endTime.toEpochMilli()))
            } else {
                for (stage in session.stages) {
                    if (stage.stage in ASLEEP_STAGES) {
                        asleep.add(SleepInterval(stage.startTime.toEpochMilli(), stage.endTime.toEpochMilli()))
                    }
                }
            }
        }
        val out = JSArray()
        for (interval in SleepIntervals.merged(asleep)) {
            out.put(
                JSObject()
                    .put("startAt", Instant.ofEpochMilli(interval.startMs).toString())
                    .put("endAt", Instant.ofEpochMilli(interval.endMs).toString())
                    .put("asleepSeconds", (interval.endMs - interval.startMs) / 1000)
            )
        }
        return out
    }

    private fun parseInstant(text: String?): Instant =
        try {
            if (text.isNullOrEmpty()) Instant.now().minusSeconds(365L * 86_400) else Instant.parse(text)
        } catch (error: Exception) {
            Instant.now().minusSeconds(365L * 86_400)
        }

    companion object {
        /** Sleeping (2), light (4), deep (5) and REM (6). Awake, out of bed and unknown do not count as asleep. */
        private val ASLEEP_STAGES = setOf(2, 4, 5, 6)
    }
}
