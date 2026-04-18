package com.example.persona.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.persona.data.PersonaDto

@Composable
fun PersonaHomeScreen(
    personas: List<PersonaDto>,
    statusText: String?,
    onContinueLast: (String) -> Unit,
    onNewChat: (String) -> Unit,
    onOpenThreads: (String) -> Unit,
    onEditPersona: (String) -> Unit,
    onSync: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    listOf(Color(0xFF0A1931), Color(0xFF2A4B7C), Color(0xFFE7F2FF)),
                ),
            )
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                text = "Persona Console",
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSync) { Text("Sync") }
                Button(onClick = onOpenSettings) { Text("Settings") }
            }
            if (!statusText.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = statusText,
                    color = Color.White.copy(alpha = 0.92f),
                )
            }
        }
        items(personas) { persona ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.94f)),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(text = persona.displayName, fontWeight = FontWeight.Bold)
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
                        Button(onClick = { onEditPersona(persona.personaId) }) {
                            Text("Edit")
                        }
                    }
                }
            }
        }
    }
}
