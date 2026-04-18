package com.example.persona

import com.example.persona.data.ContinueLastConversationResponse
import com.example.persona.data.RunStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiModelTest {
    @Test
    fun continueLastResponseMapsConversationId() {
        val dto = ContinueLastConversationResponse(
            conversationId = "conv-1",
            personaId = "coder",
            title = "Latest",
        )

        assertEquals("conv-1", dto.conversationId)
        assertEquals("coder", dto.personaId)
    }

    @Test
    fun runStatusCompletedIsTerminal() {
        val status = RunStatus.fromWire("completed")
        assertEquals(RunStatus.COMPLETED, status)
        assertTrue(status.isTerminal())
    }
}
