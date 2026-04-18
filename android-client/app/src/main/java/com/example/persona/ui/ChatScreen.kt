package com.example.persona.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.Button
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

@Composable
fun ChatScreen(
    title: String,
    conversationId: String,
    messages: List<MessageUiModel>,
    pollingStatus: String,
    onSendMessage: (String) -> Unit,
    onBack: () -> Unit,
) {
    var input by rememberSaveable { mutableStateOf("") }

    DeckBackground {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DeckPanel {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            DeckBadge(
                                text = formatRunStatusLabel(pollingStatus),
                                tone = runStatusTone(pollingStatus),
                            )
                            Text(
                                text = title,
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Black,
                            )
                            Text(
                                text = "会话 ID：$conversationId",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        OutlinedButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
                            Text(
                                text = "返回",
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }

            DeckPanel(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                if (messages.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "这里还没有消息。发一句试试，别让聊天页像空城。",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(messages, key = { it.id }) { message ->
                            val assistant = message.role == "assistant"
                            val bubbleColor = if (assistant) {
                                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.84f)
                            } else {
                                MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.84f)
                            }
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = if (assistant) Alignment.Start else Alignment.End,
                            ) {
                                Text(
                                    text = if (assistant) "Agent" else "You",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                                )
                                Text(
                                    text = message.content,
                                    modifier = Modifier
                                        .background(
                                            color = bubbleColor,
                                            shape = RoundedCornerShape(
                                                topStart = 24.dp,
                                                topEnd = 24.dp,
                                                bottomStart = if (assistant) 8.dp else 24.dp,
                                                bottomEnd = if (assistant) 24.dp else 8.dp,
                                            ),
                                        )
                                        .padding(16.dp),
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                            }
                        }
                    }
                }
            }

            DeckPanel {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    OutlinedTextField(
                        value = input,
                        onValueChange = { input = it },
                        modifier = Modifier.weight(1f),
                        label = { Text("给人格下个指令") },
                        placeholder = { Text("例如：继续刚才那件事，顺手总结一下") },
                        minLines = 3,
                        maxLines = 5,
                    )
                    Button(
                        onClick = {
                            val trimmed = input.trim()
                            if (trimmed.isNotEmpty()) {
                                onSendMessage(trimmed)
                                input = ""
                            }
                        },
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = null)
                        Text(
                            text = "发送",
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        }
    }
}
