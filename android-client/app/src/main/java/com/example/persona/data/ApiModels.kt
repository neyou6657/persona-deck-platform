package com.example.persona.data

data class PersonaDto(
    val personaId: String,
    val displayName: String,
    val description: String? = null,
    val online: Boolean,
)

data class ConversationDto(
    val conversationId: String,
    val personaId: String,
    val title: String? = null,
    val lastMessagePreview: String? = null,
    val updatedAt: String? = null,
)

data class ContinueLastConversationRequest(
    val personaId: String,
)

data class ContinueLastConversationResponse(
    val conversationId: String,
    val personaId: String,
    val title: String? = null,
)

data class CreateConversationRequest(
    val personaId: String,
    val title: String? = null,
)

data class SendMessageRequest(
    val clientMessageId: String,
    val text: String,
)

data class AcceptedRunDto(
    val runId: String,
    val conversationId: String,
    val userMessageId: String,
    val status: String,
)

data class MessageDto(
    val messageId: String,
    val conversationId: String,
    val role: String,
    val content: String,
    val createdAt: String? = null,
)

data class RunDto(
    val runId: String,
    val conversationId: String,
    val status: String,
    val assistantMessageId: String? = null,
    val error: String? = null,
) {
    fun statusEnum(): RunStatus = RunStatus.fromWire(status)
}

enum class RunStatus {
    QUEUED,
    IN_PROGRESS,
    COMPLETED,
    FAILED,
    TIMED_OUT,
    UNKNOWN,
    ;

    fun isTerminal(): Boolean = this == COMPLETED || this == FAILED || this == TIMED_OUT

    companion object {
        fun fromWire(status: String): RunStatus {
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
