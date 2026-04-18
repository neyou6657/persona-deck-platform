package me.rerere.rikkahub.data.relay

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder

interface RelayApi {
    suspend fun listPersonas(): List<RelayPersonaDto>

    suspend fun listConversations(personaId: String): List<RelayConversationDto>

    suspend fun continueLast(personaId: String): RelayContinueLastConversationResponse

    suspend fun createConversation(request: RelayCreateConversationRequest): RelayConversationDto

    suspend fun listMessages(conversationId: String): List<RelayMessageDto>

    suspend fun sendMessage(conversationId: String, request: RelaySendMessageRequest): AcceptedRelayRunDto

    suspend fun getRun(runId: String): RelayRunDto
}

class RemoteRelayApi(
    private val client: OkHttpClient,
    private val configProvider: () -> RelayServerConfig,
) : RelayApi {
    override suspend fun listPersonas(): List<RelayPersonaDto> {
        val array = requestArray("GET", "/v1/personas")
        return (0 until array.length()).mapNotNull { index ->
            array.optJSONObject(index)?.let { obj ->
                RelayPersonaDto(
                    personaId = obj.optString("personaId"),
                    displayName = obj.optString("displayName", obj.optString("personaId")),
                    description = obj.optNullableString("description"),
                    online = obj.optBoolean("online", false),
                )
            }
        }
    }

    override suspend fun listConversations(personaId: String): List<RelayConversationDto> {
        val array = requestArray("GET", "/v1/conversations?personaId=${encodeQueryValue(personaId)}")
        return (0 until array.length()).mapNotNull { index ->
            array.optJSONObject(index)?.let { obj ->
                RelayConversationDto(
                    conversationId = obj.optString("conversationId"),
                    personaId = obj.optString("personaId", personaId),
                    title = obj.optString("title", "Untitled"),
                    lastMessagePreview = obj.optNullableString("lastMessagePreview"),
                    updatedAt = obj.optNullableString("updatedAt"),
                )
            }
        }
    }

    override suspend fun continueLast(personaId: String): RelayContinueLastConversationResponse {
        val response = requestObject(
            method = "POST",
            path = "/v1/conversations/continue-last",
            body = JSONObject().put("personaId", personaId),
        )
        return RelayContinueLastConversationResponse(
            conversationId = response.optString("conversationId"),
            personaId = response.optString("personaId", personaId),
            title = response.optString("title", "New chat"),
        )
    }

    override suspend fun createConversation(request: RelayCreateConversationRequest): RelayConversationDto {
        val body = JSONObject().put("personaId", request.personaId)
        if (!request.title.isNullOrBlank()) {
            body.put("title", request.title)
        }
        val response = requestObject(
            method = "POST",
            path = "/v1/conversations",
            body = body,
        )
        return RelayConversationDto(
            conversationId = response.optString("conversationId"),
            personaId = response.optString("personaId", request.personaId),
            title = response.optString("title", "Untitled"),
            lastMessagePreview = response.optNullableString("lastMessagePreview"),
            updatedAt = response.optNullableString("updatedAt"),
        )
    }

    override suspend fun listMessages(conversationId: String): List<RelayMessageDto> {
        val response = requestObject(
            method = "GET",
            path = "/v1/conversations/${encodePathValue(conversationId)}/messages",
        )
        val messages = response.optJSONArray("messages") ?: JSONArray()
        return (0 until messages.length()).mapNotNull { index ->
            messages.optJSONObject(index)?.let { obj ->
                RelayMessageDto(
                    messageId = obj.optString("messageId"),
                    conversationId = obj.optString("conversationId", conversationId),
                    role = obj.optString("role", "assistant"),
                    content = obj.optString("content"),
                    createdAt = obj.optNullableString("createdAt"),
                )
            }
        }
    }

    override suspend fun sendMessage(
        conversationId: String,
        request: RelaySendMessageRequest,
    ): AcceptedRelayRunDto {
        val response = requestObject(
            method = "POST",
            path = "/v1/conversations/${encodePathValue(conversationId)}/messages",
            body = JSONObject()
                .put("clientMessageId", request.clientMessageId)
                .put("text", request.text),
        )
        return AcceptedRelayRunDto(
            runId = response.optString("runId"),
            conversationId = response.optString("conversationId", conversationId),
            userMessageId = response.optString("userMessageId"),
            status = response.optString("status", "queued"),
        )
    }

    override suspend fun getRun(runId: String): RelayRunDto {
        val response = requestObject(
            method = "GET",
            path = "/v1/runs/${encodePathValue(runId)}",
        )
        return RelayRunDto(
            runId = response.optString("runId", runId),
            conversationId = response.optString("conversationId"),
            status = response.optString("status", "unknown"),
            assistantMessageId = response.optNullableString("assistantMessageId"),
            error = response.optNullableString("error"),
        )
    }

    private fun requestArray(method: String, path: String): JSONArray {
        return JSONArray(requestRaw(method = method, path = path, body = null))
    }

    private fun requestObject(method: String, path: String, body: JSONObject? = null): JSONObject {
        return JSONObject(requestRaw(method = method, path = path, body = body))
    }

    private fun requestRaw(method: String, path: String, body: JSONObject?): String {
        val config = configProvider()
        val baseUrl = config.normalizedBaseUrl()
        if (!config.isConfigured()) {
            throw IOException("Relay config is incomplete. Set the base URL and user ID first.")
        }

        val requestBuilder = Request.Builder()
            .url("$baseUrl$path")
            .header("Accept", "application/json")
            .header("x-user-id", config.userId.trim())

        if (config.accessPassword.isNotBlank()) {
            requestBuilder.header("Authorization", "Bearer ${config.accessPassword}")
            requestBuilder.header("x-api-password", config.accessPassword)
        }

        if (body != null) {
            requestBuilder.method(
                method,
                body.toString().toRequestBody(JSON_MEDIA_TYPE)
            )
            requestBuilder.header("Content-Type", JSON_MEDIA_TYPE.toString())
        } else {
            requestBuilder.method(method, null)
        }

        client.newCall(requestBuilder.build()).execute().use { response ->
            val payload = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code}: ${payload.ifBlank { "request_failed" }}")
            }
            return payload
        }
    }

    private fun encodePathValue(value: String): String {
        return URLEncoder.encode(value, Charsets.UTF_8.name())
    }

    private fun encodeQueryValue(value: String): String {
        return URLEncoder.encode(value, Charsets.UTF_8.name())
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}

private fun JSONObject.optNullableString(key: String): String? {
    return if (isNull(key)) null else optString(key, "")
}
