package com.example.persona.data

import android.content.Context
import org.json.JSONObject

data class PersonaProfile(
    val personaId: String,
    val instructions: String = "",
    val notes: String = "",
    val updatedAt: Long = System.currentTimeMillis(),
)

class PersonaProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun list(): Map<String, PersonaProfile> {
        val raw = prefs.getString(KEY_PROFILES, "{}") ?: "{}"
        val root = JSONObject(raw)
        val result = mutableMapOf<String, PersonaProfile>()
        root.keys().forEach { personaId ->
            val obj = root.optJSONObject(personaId) ?: JSONObject()
            result[personaId] = PersonaProfile(
                personaId = personaId,
                instructions = obj.optString("instructions", ""),
                notes = obj.optString("notes", ""),
                updatedAt = obj.optLong("updatedAt", 0L),
            )
        }
        return result
    }

    fun get(personaId: String): PersonaProfile? = list()[personaId]

    fun save(profile: PersonaProfile) {
        val root = JSONObject(prefs.getString(KEY_PROFILES, "{}") ?: "{}")
        val obj = JSONObject()
            .put("instructions", profile.instructions)
            .put("notes", profile.notes)
            .put("updatedAt", profile.updatedAt)
        root.put(profile.personaId, obj)
        prefs.edit().putString(KEY_PROFILES, root.toString()).apply()
    }

    companion object {
        private const val PREFS_NAME = "persona_profile_store"
        private const val KEY_PROFILES = "profiles_json"
    }
}
