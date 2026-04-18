package com.example.persona.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.persona.data.ConversationDto

@Composable
fun ConversationListScreen(
    personaId: String,
    conversations: List<ConversationDto>,
    onOpenConversation: (String) -> Unit,
) {
    LazyColumn(modifier = Modifier.padding(vertical = 8.dp)) {
        item {
            Text(
                text = "Persona: $personaId",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
        items(conversations) { conversation ->
            ListItem(
                headlineContent = { Text(conversation.title ?: "Untitled chat") },
                supportingContent = {
                    Text(conversation.lastMessagePreview ?: conversation.conversationId)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenConversation(conversation.conversationId) },
            )
            HorizontalDivider()
        }
    }
}
