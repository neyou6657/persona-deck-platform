package com.example.persona.data

interface PersonaRepository {
    suspend fun listPersonas(): List<PersonaDto>
}

interface ConversationRepository {
    suspend fun listConversations(personaId: String): List<ConversationDto>

    suspend fun continueLastConversation(personaId: String): ContinueLastConversationResponse

    suspend fun createConversation(personaId: String, title: String? = null): ConversationDto

    suspend fun listMessages(conversationId: String): List<MessageDto>
}

interface ChatRepository {
    suspend fun sendMessage(conversationId: String, text: String, clientMessageId: String): AcceptedRunDto

    suspend fun pollRunUntilTerminal(runId: String): RunDto

    suspend fun sendAndAwaitReply(
        conversationId: String,
        text: String,
        clientMessageId: String,
    ): RunDto
}
