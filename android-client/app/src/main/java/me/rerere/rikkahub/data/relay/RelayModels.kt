package me.rerere.rikkahub.data.relay

data class RelayPersonaDto(
    val personaId: String,
    val displayName: String,
    val description: String? = null,
    val online: Boolean,
)

data class RelayConversationDto(
    val conversationId: String,
    val personaId: String,
    val title: String? = null,
    val lastMessagePreview: String? = null,
    val updatedAt: String? = null,
)

data class RelayContinueLastConversationResponse(
    val conversationId: String,
    val personaId: String,
    val title: String? = null,
)

data class RelayCreateConversationRequest(
    val personaId: String,
    val title: String? = null,
)

data class RelaySendMessageRequest(
    val clientMessageId: String,
    val text: String,
)

data class AcceptedRelayRunDto(
    val runId: String,
    val conversationId: String,
    val userMessageId: String,
    val status: String,
)

data class RelayMessageDto(
    val messageId: String,
    val conversationId: String,
    val role: String,
    val content: String,
    val createdAt: String? = null,
)

data class RelayRunDto(
    val runId: String,
    val conversationId: String,
    val status: String,
    val assistantMessageId: String? = null,
    val error: String? = null,
) {
    fun statusEnum(): RelayRunStatus = RelayRunStatus.fromWire(status)
}

enum class RelayRunStatus {
    QUEUED,
    IN_PROGRESS,
    COMPLETED,
    FAILED,
    TIMED_OUT,
    UNKNOWN,
    ;

    fun isTerminal(): Boolean {
        return this == COMPLETED || this == FAILED || this == TIMED_OUT
    }

    companion object {
        fun fromWire(status: String): RelayRunStatus {
            return when (status.lowercase()) {
                "queued" -> QUEUED
                "in_progress" -> IN_PROGRESS
                "completed" -> COMPLETED
                "failed" -> FAILED
                "timed_out" -> TIMED_OUT
                else -> UNKNOWN
            }
        }
    }
}

data class RelayServerConfig(
    val baseUrl: String = "",
    val accessPassword: String = "",
    val userId: String = "",
) {
    fun isConfigured(): Boolean {
        return normalizedBaseUrl().isNotBlank() && userId.trim().isNotBlank()
    }

    fun normalizedBaseUrl(): String {
        return baseUrl.trim().trimEnd('/')
    }
}
