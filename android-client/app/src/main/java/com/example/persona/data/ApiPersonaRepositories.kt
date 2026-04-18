package com.example.persona.data

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

class ApiPersonaRepository(
    private val api: PersonaApi,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PersonaRepository {
    override suspend fun listPersonas(): List<PersonaDto> = withContext(dispatcher) {
        api.listPersonas()
    }
}

class ApiConversationRepository(
    private val api: PersonaApi,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ConversationRepository {
    override suspend fun listConversations(personaId: String): List<ConversationDto> = withContext(dispatcher) {
        api.listConversations(personaId)
    }

    override suspend fun continueLastConversation(personaId: String): ContinueLastConversationResponse = withContext(dispatcher) {
        api.continueLast(ContinueLastConversationRequest(personaId))
    }

    override suspend fun createConversation(personaId: String, title: String?): ConversationDto = withContext(dispatcher) {
        api.createConversation(CreateConversationRequest(personaId, title))
    }

    override suspend fun listMessages(conversationId: String): List<MessageDto> = withContext(dispatcher) {
        api.listMessages(conversationId)
    }
}

class PollingChatRepository(
    private val api: PersonaApi,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val pollDelayMs: Long = DEFAULT_POLL_DELAY_MS,
    private val maxPollAttempts: Int = DEFAULT_MAX_POLL_ATTEMPTS,
) : ChatRepository {
    override suspend fun sendMessage(
        conversationId: String,
        text: String,
        clientMessageId: String,
    ): AcceptedRunDto = withContext(dispatcher) {
        api.sendMessage(
            conversationId = conversationId,
            request = SendMessageRequest(
                clientMessageId = clientMessageId,
                text = text,
            ),
        )
    }

    override suspend fun pollRunUntilTerminal(runId: String): RunDto = withContext(dispatcher) {
        var attempts = 0
        while (attempts < maxPollAttempts) {
            val run = api.getRun(runId)
            if (run.statusEnum().isTerminal()) {
                return@withContext run
            }
            attempts++
            delay(pollDelayMs)
        }
        RunDto(
            runId = runId,
            conversationId = "",
            status = "timed_out",
            assistantMessageId = null,
            error = "polling_timeout_after_${maxPollAttempts}_attempts",
        )
    }

    override suspend fun sendAndAwaitReply(
        conversationId: String,
        text: String,
        clientMessageId: String,
    ): RunDto {
        val accepted = sendMessage(conversationId, text, clientMessageId)
        return pollRunUntilTerminal(accepted.runId)
    }

    companion object {
        const val DEFAULT_POLL_DELAY_MS: Long = 1_000L
        const val DEFAULT_MAX_POLL_ATTEMPTS: Int = 60
    }
}
