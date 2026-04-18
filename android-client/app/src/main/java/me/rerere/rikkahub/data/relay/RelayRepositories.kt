package me.rerere.rikkahub.data.relay

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

class RelayPersonaRepository(
    private val api: RelayApi,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun listPersonas(): List<RelayPersonaDto> = withContext(dispatcher) {
        api.listPersonas()
    }
}

class RelayConversationRepository(
    private val api: RelayApi,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun listConversations(personaId: String): List<RelayConversationDto> = withContext(dispatcher) {
        api.listConversations(personaId)
    }

    suspend fun continueLastConversation(personaId: String): RelayContinueLastConversationResponse =
        withContext(dispatcher) {
            api.continueLast(personaId)
        }

    suspend fun createConversation(personaId: String, title: String? = null): RelayConversationDto =
        withContext(dispatcher) {
            api.createConversation(
                RelayCreateConversationRequest(
                    personaId = personaId,
                    title = title,
                )
            )
        }

    suspend fun listMessages(conversationId: String): List<RelayMessageDto> = withContext(dispatcher) {
        api.listMessages(conversationId)
    }
}

class RelayPollingChatRepository(
    private val api: RelayApi,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val pollDelayMs: Long = DEFAULT_POLL_DELAY_MS,
    private val maxPollAttempts: Int = DEFAULT_MAX_POLL_ATTEMPTS,
) {
    suspend fun sendMessage(
        conversationId: String,
        text: String,
        clientMessageId: String,
    ): AcceptedRelayRunDto = withContext(dispatcher) {
        api.sendMessage(
            conversationId = conversationId,
            request = RelaySendMessageRequest(
                clientMessageId = clientMessageId,
                text = text,
            ),
        )
    }

    suspend fun pollRunUntilTerminal(runId: String): RelayRunDto = withContext(dispatcher) {
        var attempts = 0
        while (attempts < maxPollAttempts) {
            val run = api.getRun(runId)
            if (run.statusEnum().isTerminal()) {
                return@withContext run
            }
            attempts++
            delay(pollDelayMs)
        }

        RelayRunDto(
            runId = runId,
            conversationId = "",
            status = "timed_out",
            assistantMessageId = null,
            error = "polling_timeout_after_${maxPollAttempts}_attempts",
        )
    }

    suspend fun sendAndAwaitReply(
        conversationId: String,
        text: String,
        clientMessageId: String,
    ): RelayRunDto {
        val accepted = sendMessage(conversationId, text, clientMessageId)
        return pollRunUntilTerminal(accepted.runId)
    }

    companion object {
        const val DEFAULT_POLL_DELAY_MS = 1_000L
        const val DEFAULT_MAX_POLL_ATTEMPTS = 90
    }
}
