package com.example.persona.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.persona.data.PersonaDto

@Composable
fun PersonaHomeScreen(
    personas: List<PersonaDto>,
    onContinueLast: (String) -> Unit,
    onNewChat: (String) -> Unit,
    onOpenThreads: (String) -> Unit,
) {
    LazyColumn(modifier = Modifier.padding(16.dp)) {
        items(personas) { persona ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(text = persona.displayName)
                    val subtitle = buildString {
                        append(if (persona.online) "Online" else "Offline")
                        if (!persona.description.isNullOrBlank()) {
                            append(" • ")
                            append(persona.description)
                        }
                    }
                    Text(
                        text = subtitle,
                        modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onContinueLast(persona.personaId) }) {
                            Text("Continue")
                        }
                        Button(onClick = { onNewChat(persona.personaId) }) {
                            Text("New Chat")
                        }
                        Button(onClick = { onOpenThreads(persona.personaId) }) {
                            Text("Threads")
                        }
                    }
                }
            }
        }
    }
}
