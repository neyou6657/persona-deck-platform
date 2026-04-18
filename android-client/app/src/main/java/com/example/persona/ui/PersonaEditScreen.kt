package com.example.persona.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.persona.data.PersonaProfile

@Composable
fun PersonaEditScreen(
    personaId: String,
    personaDisplayName: String,
    initialProfile: PersonaProfile?,
    onSave: (PersonaProfile) -> Unit,
    onBack: () -> Unit,
) {
    var instructions by remember { mutableStateOf(initialProfile?.instructions ?: "") }
    var notes by remember { mutableStateOf(initialProfile?.notes ?: "") }

    DeckBackground {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DeckPanel {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DeckBadge(
                        text = "人格编辑",
                        tone = DeckBadgeTone.Accent,
                    )
                    Text(
                        text = personaDisplayName,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        text = "Persona ID：$personaId",
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = "这里存本地人格说明。聊天时客户端会把它拼进上下文，既不裸奔，也不把所有脑浆都丢到服务器。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
                            Text(
                                text = "返回",
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                        Button(
                            onClick = {
                                onSave(
                                    PersonaProfile(
                                        personaId = personaId,
                                        instructions = instructions.trim(),
                                        notes = notes.trim(),
                                        updatedAt = System.currentTimeMillis(),
                                    ),
                                )
                            },
                        ) {
                            Icon(Icons.Outlined.Save, contentDescription = null)
                            Text(
                                text = "保存",
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }

            DeckPanel {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(
                        text = "人格说明",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    OutlinedTextField(
                        value = instructions,
                        onValueChange = { instructions = it },
                        label = { Text("聊天时自动拼接的说明") },
                        placeholder = { Text("例如：先给结论，再给最短操作步骤。") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 6,
                    )
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("你的私有备注") },
                        placeholder = { Text("例如：这个人格擅长改安卓界面。") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 4,
                    )
                }
            }
        }
    }
}
