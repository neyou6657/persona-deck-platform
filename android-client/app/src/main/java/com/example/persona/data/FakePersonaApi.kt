package com.example.persona.data

class FakePersonaApi : PersonaApi {
    private val personas = listOf(
        PersonaDto(personaId = "coder", displayName = "Code Sensei", description = "Refactor first, cry later.", online = true),
        PersonaDto(personaId = "pm", displayName = "Roadmap Ranger", description = "Everything is Q3 until proven otherwise.", online = true),
        PersonaDto(personaId = "coach", displayName = "Calm Coach", description = "Breathes in edge cases, breathes out guidance.", online = false),
    )

    private val conversationsByPersona = mutableMapOf(
        "coder" to mutableListOf(
            ConversationDto("conv-coder-1", "coder", "Refactor parser", "Let's simplify this.", "2026-04-18T08:00:00Z"),
            ConversationDto("conv-coder-2", "coder", "Kotlin tips", "Use sealed interfaces.", "2026-04-17T09:00:00Z"),
        ),
        "pm" to mutableListOf(
            ConversationDto("conv-pm-1", "pm", "Weekly planning", "What slipped and why?", "2026-04-18T07:30:00Z"),
        ),
        "coach" to mutableListOf(),
    )

    private val messagesByConversation = mutableMapOf(
        "conv-coder-1" to mutableListOf(
            MessageDto("m1", "conv-coder-1", "user", "Can you review my parser?"),
            MessageDto("m2", "conv-coder-1", "assistant", "Sure, let's isolate tokenization."),
        ),
    )

    override suspend fun listPersonas(): List<PersonaDto> = personas

    override suspend fun listConversations(personaId: String): List<ConversationDto> =
        conversationsByPersona[personaId]?.toList().orEmpty()

    override suspend fun continueLast(request: ContinueLastConversationRequest): ContinueLastConversationResponse {
        val latest = conversationsByPersona[request.personaId]?.firstOrNull()
        if (latest != null) {
            return ContinueLastConversationResponse(latest.conversationId, latest.personaId, latest.title)
        }

        val conversationId = "conv-${request.personaId}-new"
        val created = ConversationDto(conversationId, request.personaId, "New chat")
        conversationsByPersona.getOrPut(request.personaId) { mutableListOf() }.add(0, created)
        return ContinueLastConversationResponse(created.conversationId, created.personaId, created.title)
    }

    override suspend fun createConversation(request: CreateConversationRequest): ConversationDto {
        val nextId = "conv-${request.personaId}-${System.currentTimeMillis()}"
        val created = ConversationDto(nextId, request.personaId, request.title ?: "Untitled chat")
        conversationsByPersona.getOrPut(request.personaId) { mutableListOf() }.add(0, created)
        messagesByConversation[nextId] = mutableListOf()
        return created
    }

    override suspend fun listMessages(conversationId: String): List<MessageDto> {
        return messagesByConversation[conversationId]?.toList().orEmpty()
    }

    override suspend fun sendMessage(conversationId: String, request: SendMessageRequest): AcceptedRunDto {
        val messageId = "user-${request.clientMessageId}"
        val userMessage = MessageDto(
            messageId = messageId,
            conversationId = conversationId,
            role = "user",
            content = request.text,
        )
        messagesByConversation.getOrPut(conversationId) { mutableListOf() }.add(userMessage)

        val assistantMessage = MessageDto(
            messageId = "assistant-${request.clientMessageId}",
            conversationId = conversationId,
            role = "assistant",
            content = "Echo from persona worker: ${request.text}",
        )
        messagesByConversation.getOrPut(conversationId) { mutableListOf() }.add(assistantMessage)

        return AcceptedRunDto(
            runId = "run-${request.clientMessageId}",
            conversationId = conversationId,
            userMessageId = messageId,
            status = "queued",
        )
    }

    override suspend fun getRun(runId: String): RunDto {
        return RunDto(
            runId = runId,
            conversationId = "",
            status = "completed",
            assistantMessageId = "assistant-${runId.removePrefix("run-")}",
            error = null,
        )
    }
}
