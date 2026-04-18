package com.example.persona.data

interface PersonaApi {
    suspend fun listPersonas(): List<PersonaDto>

    suspend fun listConversations(personaId: String): List<ConversationDto>

    suspend fun continueLast(request: ContinueLastConversationRequest): ContinueLastConversationResponse

    suspend fun createConversation(request: CreateConversationRequest): ConversationDto

    suspend fun listMessages(conversationId: String): List<MessageDto>

    suspend fun sendMessage(conversationId: String, request: SendMessageRequest): AcceptedRunDto

    suspend fun getRun(runId: String): RunDto
}
