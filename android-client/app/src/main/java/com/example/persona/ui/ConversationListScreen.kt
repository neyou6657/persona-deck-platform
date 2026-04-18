package com.example.persona.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.persona.data.ConversationDto

@Composable
fun ConversationListScreen(
    personaId: String,
    conversations: List<ConversationDto>,
    onOpenConversation: (String) -> Unit,
    onBack: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    listOf(Color(0xFF11283C), Color(0xFF23506C), Color(0xFFEAF5FF)),
                ),
            )
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onBack) { Text("Back") }
                Text(
                    text = "Threads for $personaId",
                    modifier = Modifier.padding(top = 10.dp),
                    color = Color.White,
                )
            }
        }
        items(conversations) { conversation ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenConversation(conversation.conversationId) },
            ) {
                Text(
                    text = conversation.title ?: "Untitled chat",
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
                Text(
                    text = conversation.lastMessagePreview ?: conversation.conversationId,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    color = Color.Gray,
                )
                Text(
                    text = conversation.updatedAt ?: "",
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    color = Color.Gray,
                )
            }
        }
    }
}
