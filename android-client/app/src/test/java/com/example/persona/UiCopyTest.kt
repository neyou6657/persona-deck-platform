package com.example.persona

import com.example.persona.config.ServerConfig
import com.example.persona.data.ConversationDto
import com.example.persona.data.PersonaDto
import com.example.persona.data.PersonaProfile
import com.example.persona.ui.formatConversationMeta
import com.example.persona.ui.formatPersonaPromptHint
import com.example.persona.ui.formatPersonaSummary
import com.example.persona.ui.formatRunStatusLabel
import com.example.persona.ui.formatServerSummary
import org.junit.Assert.assertEquals
import org.junit.Test

class UiCopyTest {
    @Test
    fun formatServerSummaryShowsLocalDemoWhenServerMissing() {
        val summary = formatServerSummary(ServerConfig())

        assertEquals("本地演示模式", summary)
    }

    @Test
    fun formatServerSummaryShowsConfiguredServerHost() {
        val summary = formatServerSummary(
            ServerConfig(
                baseUrl = "https://persona.example.net",
                password = "secret",
                userId = "u-demo",
            ),
        )

        assertEquals("已连接 persona.example.net", summary)
    }

    @Test
    fun formatPersonaSummaryBlendsPresenceAndDescription() {
        val summary = formatPersonaSummary(
            PersonaDto(
                personaId = "coder",
                displayName = "Code Sensei",
                description = "负责改代码",
                online = true,
            ),
        )

        assertEquals("在线待命 • 负责改代码", summary)
    }

    @Test
    fun formatPersonaPromptHintFallsBackWhenNoProfileExists() {
        val hint = formatPersonaPromptHint(null)

        assertEquals("未设置人格说明", hint)
    }

    @Test
    fun formatPersonaPromptHintUsesInstructionPreview() {
        val hint = formatPersonaPromptHint(
            PersonaProfile(
                personaId = "coder",
                instructions = "回复时先给结论，再给最短操作步骤。",
                notes = "",
            ),
        )

        assertEquals("回复时先给结论，再给最短操作步骤。", hint)
    }

    @Test
    fun formatConversationMetaPrefersPreviewAndTimestamp() {
        val meta = formatConversationMeta(
            ConversationDto(
                conversationId = "c-1",
                personaId = "coder",
                title = "修 Deno",
                lastMessagePreview = "刚刚把首页改成了管理台",
                updatedAt = "2026-04-18 11:55:35",
            ),
        )

        assertEquals("刚刚把首页改成了管理台 • 2026-04-18 11:55:35", meta)
    }

    @Test
    fun formatRunStatusLabelHumanizesCommonStates() {
        assertEquals("等待执行", formatRunStatusLabel("queued"))
        assertEquals("正在思考", formatRunStatusLabel("in_progress"))
        assertEquals("已经回话", formatRunStatusLabel("completed"))
        assertEquals("执行失败", formatRunStatusLabel("failed"))
    }
}
