package com.example.persona.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    listOf(Color(0xFF1C2338), Color(0xFF254E70), Color(0xFFE8F4FF)),
                ),
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(onClick = onBack) { Text("Back") }
            Text(
                text = title,
                modifier = Modifier.padding(top = 10.dp),
                color = Color.White,
            )
        }

        Text(
            text = "Conversation: $conversationId",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            color = Color.White.copy(alpha = 0.92f),
        )

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(messages, key = { it.id }) { message ->
                val bubbleColor = if (message.role == "assistant") Color(0xFFE8EBFF) else Color(0xFFDCF4E3)
                Text(
                    text = "${message.role}: ${message.content}",
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(bubbleColor, shape = RoundedCornerShape(14.dp))
                        .padding(12.dp),
                )
            }
        }

        Text(
            text = "Run status: $pollingStatus",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            color = Color.White.copy(alpha = 0.92f),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Type a message") },
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
                Text("Send")
            }
        }
    }
}
