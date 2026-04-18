package com.example.persona

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.persona.data.ApiConversationRepository
import com.example.persona.data.ApiPersonaRepository
import com.example.persona.data.ConversationDto
import com.example.persona.data.FakePersonaApi
import com.example.persona.data.PollingChatRepository
import com.example.persona.data.RunStatus
import com.example.persona.ui.ChatScreen
import com.example.persona.ui.ConversationListScreen
import com.example.persona.ui.MessageUiModel
import com.example.persona.ui.PersonaHomeScreen
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                PersonaClientApp()
            }
        }
    }
}

private object Routes {
    const val Home = "home"
    const val Conversations = "conversations/{personaId}"
    const val Chat = "chat/{conversationId}"

    fun conversations(personaId: String): String = "conversations/$personaId"
    fun chat(conversationId: String): String = "chat/$conversationId"
}

@Composable
private fun PersonaClientApp() {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()

    val api = remember { FakePersonaApi() }
    val personaRepository = remember { ApiPersonaRepository(api) }
    val conversationRepository = remember { ApiConversationRepository(api) }
    val chatRepository = remember { PollingChatRepository(api) }

    var personas by remember { mutableStateOf(emptyList<com.example.persona.data.PersonaDto>()) }
    val conversationsByPersona = remember { mutableStateMapOf<String, List<ConversationDto>>() }
    val messagesByConversation = remember { mutableStateMapOf<String, List<MessageUiModel>>() }
    val runStatusByConversation = remember { mutableStateMapOf<String, String>() }

    LaunchedEffect(Unit) {
        personas = personaRepository.listPersonas()
    }

    NavHost(
        navController = navController,
        startDestination = Routes.Home,
    ) {
        composable(Routes.Home) {
            PersonaHomeScreen(
                personas = personas,
                onContinueLast = { personaId ->
                    scope.launch {
                        val conversation = conversationRepository.continueLastConversation(personaId)
                        val messages = conversationRepository.listMessages(conversation.conversationId)
                        messagesByConversation[conversation.conversationId] = messages.map {
                            MessageUiModel(it.messageId, it.role, it.content)
                        }
                        runStatusByConversation[conversation.conversationId] = RunStatus.QUEUED.name.lowercase()
                        navController.navigate(Routes.chat(conversation.conversationId))
                    }
                },
                onNewChat = { personaId ->
                    scope.launch {
                        val conversation = conversationRepository.createConversation(personaId)
                        conversationsByPersona[personaId] = listOf(conversation) + conversationsByPersona[personaId].orEmpty()
                        messagesByConversation[conversation.conversationId] = emptyList()
                        runStatusByConversation[conversation.conversationId] = RunStatus.QUEUED.name.lowercase()
                        navController.navigate(Routes.chat(conversation.conversationId))
                    }
                },
                onOpenThreads = { personaId ->
                    scope.launch {
                        conversationsByPersona[personaId] = conversationRepository.listConversations(personaId)
                        navController.navigate(Routes.conversations(personaId))
                    }
                },
            )
        }

        composable(
            route = Routes.Conversations,
            arguments = listOf(navArgument("personaId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val personaId = backStackEntry.arguments?.getString("personaId").orEmpty()
            ConversationListScreen(
                personaId = personaId,
                conversations = conversationsByPersona[personaId].orEmpty(),
                onOpenConversation = { conversationId ->
                    scope.launch {
                        val messages = conversationRepository.listMessages(conversationId)
                        messagesByConversation[conversationId] = messages.map {
                            MessageUiModel(it.messageId, it.role, it.content)
                        }
                        runStatusByConversation.putIfAbsent(conversationId, RunStatus.QUEUED.name.lowercase())
                        navController.navigate(Routes.chat(conversationId))
                    }
                },
            )
        }

        composable(
            route = Routes.Chat,
            arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val conversationId = backStackEntry.arguments?.getString("conversationId").orEmpty()
            ChatScreen(
                conversationId = conversationId,
                messages = messagesByConversation[conversationId].orEmpty(),
                pollingStatus = runStatusByConversation[conversationId] ?: "idle",
                onSendMessage = { text ->
                    scope.launch {
                        val clientMessageId = UUID.randomUUID().toString()
                        runStatusByConversation[conversationId] = RunStatus.QUEUED.name.lowercase()
                        val run = chatRepository.sendAndAwaitReply(conversationId, text, clientMessageId)
                        runStatusByConversation[conversationId] = run.status
                        val messages = conversationRepository.listMessages(conversationId)
                        messagesByConversation[conversationId] = messages.map {
                            MessageUiModel(it.messageId, it.role, it.content)
                        }
                    }
                },
            )
        }
    }
}
