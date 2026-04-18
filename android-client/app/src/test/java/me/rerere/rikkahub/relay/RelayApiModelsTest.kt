package me.rerere.rikkahub.relay

import kotlinx.coroutines.runBlocking
import me.rerere.rikkahub.data.relay.AcceptedRelayRunDto
import me.rerere.rikkahub.data.relay.RelayApi
import me.rerere.rikkahub.data.relay.RelayContinueLastConversationResponse
import me.rerere.rikkahub.data.relay.RelayConversationDto
import me.rerere.rikkahub.data.relay.RelayCreateConversationRequest
import me.rerere.rikkahub.data.relay.RelayMessageDto
import me.rerere.rikkahub.data.relay.RelayRunDto
import me.rerere.rikkahub.data.relay.RelayRunStatus
import me.rerere.rikkahub.data.relay.RelaySendMessageRequest
import me.rerere.rikkahub.data.relay.RelayServerConfig
import me.rerere.rikkahub.data.relay.RelayPersonaDto
import me.rerere.rikkahub.data.relay.RelayPollingChatRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RelayApiModelsTest {
    @Test
    fun continueLastResponseMapsConversationId() {
        val dto = RelayContinueLastConversationResponse(
            conversationId = "conv-1",
            personaId = "coder",
            title = "Latest",
        )

        assertEquals("conv-1", dto.conversationId)
        assertEquals("coder", dto.personaId)
    }

    @Test
    fun runStatusCompletedIsTerminal() {
        val status = RelayRunStatus.fromWire("completed")

        assertEquals(RelayRunStatus.COMPLETED, status)
        assertTrue(status.isTerminal())
    }

    @Test
    fun serverConfigIsConfiguredWhenBaseUrlAndUserIdExist() {
        val config = RelayServerConfig(
            baseUrl = "https://relay.example.com/",
            accessPassword = "secret",
            userId = "device-123",
        )

        assertTrue(config.isConfigured())
        assertEquals("https://relay.example.com", config.normalizedBaseUrl())
    }

    @Test
    fun serverConfigRejectsBlankUserId() {
        val config = RelayServerConfig(
            baseUrl = "https://relay.example.com",
            accessPassword = "",
            userId = "",
        )

        assertFalse(config.isConfigured())
    }

    @Test
    fun sendAndAwaitReplyPollsUntilTerminal() = runBlocking {
        val api = FakeRelayApi(
            runResponses = ArrayDeque(
                listOf(
                    RelayRunDto(
                        runId = "run-1",
                        conversationId = "conv-1",
                        status = "queued",
                        assistantMessageId = null,
                        error = null,
                    ),
                    RelayRunDto(
                        runId = "run-1",
                        conversationId = "conv-1",
                        status = "completed",
                        assistantMessageId = "msg-assistant-1",
                        error = null,
                    ),
                )
            )
        )
        val repo = RelayPollingChatRepository(
            api = api,
            pollDelayMs = 0,
            maxPollAttempts = 3,
        )

        val result = repo.sendAndAwaitReply(
            conversationId = "conv-1",
            text = "hello",
            clientMessageId = "msg-user-1",
        )

        assertEquals(RelayRunStatus.COMPLETED, result.statusEnum())
        assertEquals(listOf("send:conv-1", "run:run-1", "run:run-1"), api.calls)
    }

    @Test
    fun pollRunReturnsTimedOutWhenAttemptsExceeded() = runBlocking {
        val api = FakeRelayApi(
            runResponses = ArrayDeque(
                listOf(
                    RelayRunDto(
                        runId = "run-1",
                        conversationId = "conv-1",
                        status = "queued",
                        assistantMessageId = null,
                        error = null,
                    )
                )
            )
        )
        val repo = RelayPollingChatRepository(
            api = api,
            pollDelayMs = 0,
            maxPollAttempts = 1,
        )

        val result = repo.pollRunUntilTerminal("run-1")

        assertEquals(RelayRunStatus.TIMED_OUT, result.statusEnum())
        assertEquals("polling_timeout_after_1_attempts", result.error)
    }
}

private class FakeRelayApi(
    private val runResponses: ArrayDeque<RelayRunDto>,
) : RelayApi {
    val calls = mutableListOf<String>()

    override suspend fun listPersonas(): List<RelayPersonaDto> = emptyList()

    override suspend fun listConversations(personaId: String): List<RelayConversationDto> = emptyList()

    override suspend fun continueLast(personaId: String): RelayContinueLastConversationResponse {
        error("Not used in test")
    }

    override suspend fun createConversation(request: RelayCreateConversationRequest): RelayConversationDto {
        error("Not used in test")
    }

    override suspend fun listMessages(conversationId: String): List<RelayMessageDto> = emptyList()

    override suspend fun sendMessage(
        conversationId: String,
        request: RelaySendMessageRequest,
    ): AcceptedRelayRunDto {
        calls += "send:$conversationId"
        return AcceptedRelayRunDto(
            runId = "run-1",
            conversationId = conversationId,
            userMessageId = request.clientMessageId,
            status = "queued",
        )
    }

    override suspend fun getRun(runId: String): RelayRunDto {
        calls += "run:$runId"
        return runResponses.removeFirstOrNull() ?: RelayRunDto(
            runId = runId,
            conversationId = "conv-1",
            status = "queued",
            assistantMessageId = null,
            error = null,
        )
    }
}
