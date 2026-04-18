package me.rerere.rikkahub.data.relay

import android.content.Context
import java.util.UUID

class RelayConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): RelayServerConfig {
        val storedUserId = prefs.getString(KEY_USER_ID, "")?.trim().orEmpty()
        val userId = if (storedUserId.isBlank()) {
            val generated = "android-${UUID.randomUUID()}"
            prefs.edit().putString(KEY_USER_ID, generated).apply()
            generated
        } else {
            storedUserId
        }

        return RelayServerConfig(
            baseUrl = prefs.getString(KEY_BASE_URL, "") ?: "",
            accessPassword = prefs.getString(KEY_ACCESS_PASSWORD, "") ?: "",
            userId = userId,
        )
    }

    fun save(config: RelayServerConfig) {
        val sanitizedUserId = config.userId.trim().ifBlank { "android-${UUID.randomUUID()}" }
        prefs.edit()
            .putString(KEY_BASE_URL, config.normalizedBaseUrl())
            .putString(KEY_ACCESS_PASSWORD, config.accessPassword)
            .putString(KEY_USER_ID, sanitizedUserId)
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "relay_config"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_ACCESS_PASSWORD = "access_password"
        private const val KEY_USER_ID = "user_id"
    }
}
