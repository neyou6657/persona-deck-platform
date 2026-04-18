package com.example.persona.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.persona.data.ConversationDto

@Composable
fun ConversationListScreen(
    personaId: String,
    conversations: List<ConversationDto>,
    onOpenConversation: (String) -> Unit,
    onBack: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val filteredConversations = conversations.filter { conversation ->
        if (query.isBlank()) {
            true
        } else {
            val needle = query.trim().lowercase()
            listOf(
                conversation.title,
                conversation.lastMessagePreview,
                conversation.conversationId,
            ).any { value -> value?.lowercase()?.contains(needle) == true }
        }
    }

    DeckBackground {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                DeckPanel {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        DeckBadge(
                            text = "会话仓库",
                            tone = DeckBadgeTone.Accent,
                        )
                        Text(
                            text = "人格会话",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Black,
                        )
                        Text(
                            text = "当前人格：$personaId。这里保留上一轮对话，也让你新开一件事时不会和旧坑缠成毛线。",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            label = { Text("筛选会话") },
                            placeholder = { Text("按标题、预览或会话 ID 搜") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
                            Text(
                                text = "返回人格甲板",
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }

            if (filteredConversations.isEmpty()) {
                item {
                    DeckPanel {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                text = if (conversations.isEmpty()) "还没有历史会话" else "没有命中搜索结果",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = if (conversations.isEmpty()) {
                                    "回到人格卡片里点“新对话”或者“接着聊”。会话列表现在还是空仓库。"
                                } else {
                                    "换个关键词试试。现在只是筛不到，不是线程没了。"
                                },
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            } else {
                items(filteredConversations, key = { it.conversationId }) { conversation ->
                    ElevatedCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenConversation(conversation.conversationId) },
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
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
                                        text = conversation.title?.ifBlank { "未命名会话" } ?: "未命名会话",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        text = conversation.conversationId,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                                DeckBadge(
                                    text = "打开",
                                    tone = DeckBadgeTone.Success,
                                )
                            }
                            Text(
                                text = formatConversationMeta(conversation),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Outlined.Forum, contentDescription = null)
                                Text(
                                    text = "点开继续当前线程",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
