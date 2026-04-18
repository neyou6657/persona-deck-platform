package com.example.persona.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddComment
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.persona.config.ServerConfig
import com.example.persona.data.PersonaDto
import com.example.persona.data.PersonaProfile

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PersonaHomeScreen(
    personas: List<PersonaDto>,
    personaProfiles: Map<String, PersonaProfile>,
    serverConfig: ServerConfig,
    statusText: String?,
    onContinueLast: (String) -> Unit,
    onNewChat: (String) -> Unit,
    onOpenThreads: (String) -> Unit,
    onEditPersona: (String) -> Unit,
    onSync: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    DeckBackground {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                DeckPanel {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        DeckBadge(
                            text = "RikkaHub 风格人格甲板",
                            tone = DeckBadgeTone.Accent,
                        )
                        Text(
                            text = "Persona Deck",
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Black,
                        )
                        Text(
                            text = "连接 Deno 控制面，切人格、接着聊、开新事，别再拿之前那层薄壳糊弄自己。",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            DeckBadge(
                                text = formatServerSummary(serverConfig),
                                tone = if (serverConfig.isConfigured()) DeckBadgeTone.Success else DeckBadgeTone.Neutral,
                            )
                            DeckBadge(
                                text = "人格 ${personas.size}",
                                tone = DeckBadgeTone.Accent,
                            )
                            if (!statusText.isNullOrBlank()) {
                                DeckBadge(
                                    text = statusText,
                                    tone = DeckBadgeTone.Neutral,
                                )
                            }
                        }
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Button(onClick = onSync) {
                                Icon(Icons.Outlined.Refresh, contentDescription = null)
                                Spacer(modifier = Modifier.height(0.dp))
                                Text(
                                    text = "同步",
                                    modifier = Modifier.padding(start = 8.dp),
                                )
                            }
                            OutlinedButton(onClick = onOpenSettings) {
                                Icon(Icons.Outlined.Settings, contentDescription = null)
                                Text(
                                    text = "服务器",
                                    modifier = Modifier.padding(start = 8.dp),
                                )
                            }
                        }
                    }
                }
            }

            item {
                Text(
                    text = "数字人格",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }

            if (personas.isEmpty()) {
                item {
                    DeckPanel {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                text = "还没有同步到人格",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "先去配置 Deno 地址和密码，再点一次同步。壳子终于换好，别让它继续空着。",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            } else {
                items(personas, key = { it.personaId }) { persona ->
                    ElevatedCard(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.elevatedCardColors(
                            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                        ),
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top,
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        text = persona.displayName,
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        text = persona.personaId,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                    Text(
                                        text = formatPersonaSummary(persona),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                DeckBadge(
                                    text = if (persona.online) "在线" else "离线",
                                    tone = if (persona.online) DeckBadgeTone.Success else DeckBadgeTone.Neutral,
                                )
                            }

                            DeckPanel {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        text = "人格说明",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = formatPersonaPromptHint(personaProfiles[persona.personaId]),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }

                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                OutlinedButton(onClick = { onContinueLast(persona.personaId) }) {
                                    Icon(Icons.Outlined.AutoAwesome, contentDescription = null)
                                    Text(
                                        text = "接着聊",
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                                Button(onClick = { onNewChat(persona.personaId) }) {
                                    Icon(Icons.Outlined.AddComment, contentDescription = null)
                                    Text(
                                        text = "新对话",
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                                OutlinedButton(onClick = { onOpenThreads(persona.personaId) }) {
                                    Icon(Icons.Outlined.Forum, contentDescription = null)
                                    Text(
                                        text = "会话",
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                                OutlinedButton(onClick = { onEditPersona(persona.personaId) }) {
                                    Icon(Icons.Outlined.EditNote, contentDescription = null)
                                    Text(
                                        text = "人格说明",
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
