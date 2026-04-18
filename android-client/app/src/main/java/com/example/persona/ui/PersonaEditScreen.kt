package com.example.persona.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    listOf(Color(0xFF1B1227), Color(0xFF3D2D52), Color(0xFFF6EFFD)),
                ),
            )
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Edit Persona",
            style = MaterialTheme.typography.headlineSmall,
            color = Color.White,
        )
        Text(
            text = "$personaDisplayName ($personaId)",
            color = Color.White.copy(alpha = 0.92f),
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White.copy(alpha = 0.95f), RoundedCornerShape(18.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = instructions,
                onValueChange = { instructions = it },
                label = { Text("Persona Instruction") },
                placeholder = { Text("Example: Be concise and action-oriented.") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 4,
            )
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Private Notes") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 4,
            )
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
                Text("Save Persona")
            }
            Button(onClick = onBack) {
                Text("Back")
            }
        }
    }
}
