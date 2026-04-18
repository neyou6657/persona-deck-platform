package com.example.persona.data

import com.example.persona.config.ServerConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class RemotePersonaApi(
    private val configProvider: () -> ServerConfig,
) : PersonaApi {
    override suspend fun listPersonas(): List<PersonaDto> {
        val array = requestArray("GET", "/v1/personas")
        return (0 until array.length()).mapNotNull { idx ->
            array.optJSONObject(idx)?.let { obj ->
                PersonaDto(
                    personaId = obj.optString("personaId"),
                    displayName = obj.optString("displayName", obj.optString("personaId")),
                    description = obj.optString("description", ""),
                    online = obj.optBoolean("online", false),
                )
            }
        }
    }

    override suspend fun listConversations(personaId: String): List<ConversationDto> {
        val queryPersona = encodeQueryValue(personaId)
        val array = requestArray("GET", "/v1/conversations?personaId=$queryPersona")
        return (0 until array.length()).mapNotNull { idx ->
            array.optJSONObject(idx)?.let { obj ->
                ConversationDto(
                    conversationId = obj.optString("conversationId"),
                    personaId = obj.optString("personaId", personaId),
                    title = obj.optString("title", "Untitled"),
                    lastMessagePreview = obj.optString("lastMessagePreview", ""),
                    updatedAt = obj.optString("updatedAt", ""),
                )
            }
        }
    }

    override suspend fun continueLast(request: ContinueLastConversationRequest): ContinueLastConversationResponse {
        val response = requestObject(
            method = "POST",
            path = "/v1/conversations/continue-last",
            body = JSONObject().put("personaId", request.personaId),
        )
        return ContinueLastConversationResponse(
            conversationId = response.optString("conversationId"),
            personaId = response.optString("personaId", request.personaId),
            title = response.optString("title", "New chat"),
        )
    }

    override suspend fun createConversation(request: CreateConversationRequest): ConversationDto {
        val payload = JSONObject().put("personaId", request.personaId)
        if (!request.title.isNullOrBlank()) {
            payload.put("title", request.title)
        }
        val response = requestObject(
            method = "POST",
            path = "/v1/conversations",
            body = payload,
        )
        return ConversationDto(
            conversationId = response.optString("conversationId"),
            personaId = response.optString("personaId", request.personaId),
            title = response.optString("title", "Untitled"),
            lastMessagePreview = response.optString("lastMessagePreview", ""),
            updatedAt = response.optString("updatedAt", ""),
        )
    }

    override suspend fun listMessages(conversationId: String): List<MessageDto> {
        val response = requestObject(
            method = "GET",
            path = "/v1/conversations/${encodePathValue(conversationId)}/messages",
        )
        val messages = response.optJSONArray("messages") ?: JSONArray()
        return (0 until messages.length()).mapNotNull { idx ->
            messages.optJSONObject(idx)?.let { obj ->
                MessageDto(
                    messageId = obj.optString("messageId"),
                    conversationId = obj.optString("conversationId", conversationId),
                    role = obj.optString("role", "assistant"),
                    content = obj.optString("content", ""),
                    createdAt = obj.optString("createdAt", ""),
                )
            }
        }
    }

    override suspend fun sendMessage(conversationId: String, request: SendMessageRequest): AcceptedRunDto {
        val response = requestObject(
            method = "POST",
            path = "/v1/conversations/${encodePathValue(conversationId)}/messages",
            body = JSONObject()
                .put("clientMessageId", request.clientMessageId)
                .put("text", request.text),
        )
        return AcceptedRunDto(
            runId = response.optString("runId"),
            conversationId = response.optString("conversationId", conversationId),
            userMessageId = response.optString("userMessageId"),
            status = response.optString("status", "queued"),
        )
    }

    override suspend fun getRun(runId: String): RunDto {
        val response = requestObject(
            method = "GET",
            path = "/v1/runs/${encodePathValue(runId)}",
        )
        return RunDto(
            runId = response.optString("runId", runId),
            conversationId = response.optString("conversationId", ""),
            status = response.optString("status", "unknown"),
            assistantMessageId = response.optNullableString("assistantMessageId"),
            error = response.optNullableString("error"),
        )
    }

    private fun requestArray(method: String, path: String): JSONArray {
        val payload = requestRaw(method = method, path = path, body = null)
        return JSONArray(payload)
    }

    private fun requestObject(method: String, path: String, body: JSONObject? = null): JSONObject {
        val payload = requestRaw(method = method, path = path, body = body)
        return JSONObject(payload)
    }

    private fun requestRaw(method: String, path: String, body: JSONObject?): String {
        val cfg = configProvider()
        val base = cfg.baseUrl.trim().trimEnd('/')
        if (base.isBlank() || cfg.userId.isBlank()) {
            throw IOException("Server config is incomplete. Set URL and user ID first.")
        }
        val url = URL("$base$path")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = TimeUnit.SECONDS.toMillis(20).toInt()
            readTimeout = TimeUnit.SECONDS.toMillis(45).toInt()
            doInput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("x-user-id", cfg.userId.trim())
            if (cfg.password.isNotBlank()) {
                setRequestProperty("x-api-password", cfg.password)
                setRequestProperty("Authorization", "Bearer ${cfg.password}")
            }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        body?.let {
            connection.outputStream.use { output ->
                output.write(it.toString().toByteArray(Charsets.UTF_8))
            }
        }

        val code = connection.responseCode
        val text = if (code in 200..299) {
            connection.inputStream.bufferedReader().use { it.readText() }
        } else {
            val err = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "request_failed"
            throw IOException("HTTP $code: $err")
        }
        connection.disconnect()
        return text
    }

    private fun encodePathValue(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    private fun encodeQueryValue(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}

private fun JSONObject.optNullableString(key: String): String? {
    return if (isNull(key)) null else optString(key, "")
}
