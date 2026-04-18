package com.example.persona.config

import android.content.Context

data class ServerConfig(
    val baseUrl: String = "",
    val password: String = "",
    val userId: String = "",
) {
    fun isConfigured(): Boolean = baseUrl.isNotBlank() && userId.isNotBlank()
}

class ServerConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): ServerConfig {
        return ServerConfig(
            baseUrl = prefs.getString(KEY_BASE_URL, "") ?: "",
            password = prefs.getString(KEY_PASSWORD, "") ?: "",
            userId = prefs.getString(KEY_USER_ID, "") ?: "",
        )
    }

    fun save(config: ServerConfig) {
        prefs.edit()
            .putString(KEY_BASE_URL, config.baseUrl.trim())
            .putString(KEY_PASSWORD, config.password)
            .putString(KEY_USER_ID, config.userId.trim())
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "persona_server_config"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_PASSWORD = "password"
        private const val KEY_USER_ID = "user_id"
    }
}
