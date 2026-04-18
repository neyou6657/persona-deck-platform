package com.example.persona.ui

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.persona.config.ServerConfig
import com.example.persona.data.ConversationDto
import com.example.persona.data.PersonaDto
import com.example.persona.data.PersonaProfile
import java.net.URI

private val DeckLightColors = lightColorScheme(
    primary = Color(0xFF8A4F27),
    onPrimary = Color(0xFFFFFBF7),
    primaryContainer = Color(0xFFF3D3B8),
    secondary = Color(0xFF406173),
    onSecondary = Color(0xFFF7FBFE),
    tertiary = Color(0xFF765A2C),
    background = Color(0xFFF7F1E8),
    onBackground = Color(0xFF211A14),
    surface = Color(0xFFFFFBF7),
    onSurface = Color(0xFF241B13),
    surfaceVariant = Color(0xFFE7D8C9),
    onSurfaceVariant = Color(0xFF564336),
    outline = Color(0xFF8B7564),
)

enum class DeckBadgeTone {
    Neutral,
    Accent,
    Success,
    Danger,
}

@Composable
fun PersonaDeckTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val colorScheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> dynamicLightColorScheme(context)
        else -> DeckLightColors
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}

@Composable
fun DeckBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    listOf(
                        Color(0xFFF6EFE6),
                        Color(0xFFF0E5D8),
                        Color(0xFFE8EEF4),
                    ),
                ),
            )
            .padding(16.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0x33D37A4B), Color.Transparent),
                        radius = 860f,
                    ),
                ),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0x22629AB0), Color.Transparent),
                        radius = 920f,
                    ),
                ),
        )
        content()
    }
}

@Composable
fun DeckPanel(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(30.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
        tonalElevation = 4.dp,
        shadowElevation = 4.dp,
    ) {
        Box(modifier = Modifier.padding(20.dp)) {
            content()
        }
    }
}

@Composable
fun DeckBadge(
    text: String,
    tone: DeckBadgeTone,
    modifier: Modifier = Modifier,
) {
    val background = when (tone) {
        DeckBadgeTone.Neutral -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f)
        DeckBadgeTone.Accent -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.94f)
        DeckBadgeTone.Success -> Color(0xFFD7F0DE)
        DeckBadgeTone.Danger -> Color(0xFFF8D8D4)
    }
    val foreground = when (tone) {
        DeckBadgeTone.Neutral -> MaterialTheme.colorScheme.onSurfaceVariant
        DeckBadgeTone.Accent -> MaterialTheme.colorScheme.primary
        DeckBadgeTone.Success -> Color(0xFF155B2F)
        DeckBadgeTone.Danger -> Color(0xFF8F3024)
    }
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = background,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = text,
                color = foreground,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

fun formatServerSummary(config: ServerConfig): String {
    if (!config.isConfigured()) {
        return "本地演示模式"
    }
    val host = runCatching {
        URI(config.baseUrl).host
    }.getOrNull()?.takeIf { it.isNotBlank() } ?: config.baseUrl
    return "已连接 $host"
}

fun formatPersonaSummary(persona: PersonaDto): String {
    val presence = if (persona.online) "在线待命" else "暂未在线"
    val description = persona.description?.trim().orEmpty()
    return if (description.isBlank()) presence else "$presence • $description"
}

fun formatPersonaPromptHint(profile: PersonaProfile?): String {
    val text = profile?.instructions?.trim().orEmpty()
    if (text.isBlank()) {
        return "未设置人格说明"
    }
    return if (text.length <= 28) text else "${text.take(28)}..."
}

fun formatConversationMeta(conversation: ConversationDto): String {
    val preview = conversation.lastMessagePreview?.trim().orEmpty().ifBlank { "还没有消息，像刚擦过的白板。" }
    val updatedAt = conversation.updatedAt?.trim().orEmpty()
    return if (updatedAt.isBlank()) preview else "$preview • $updatedAt"
}

fun formatRunStatusLabel(status: String): String {
    return when (status.lowercase()) {
        "queued" -> "等待执行"
        "in_progress" -> "正在思考"
        "completed" -> "已经回话"
        "failed" -> "执行失败"
        "timed_out" -> "等待超时"
        else -> "状态未知"
    }
}

fun runStatusTone(status: String): DeckBadgeTone {
    return when (status.lowercase()) {
        "completed" -> DeckBadgeTone.Success
        "failed", "timed_out" -> DeckBadgeTone.Danger
        "queued", "in_progress" -> DeckBadgeTone.Accent
        else -> DeckBadgeTone.Neutral
    }
}
