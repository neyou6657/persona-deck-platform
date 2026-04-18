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
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.persona.config.ServerConfig
import com.example.persona.config.ServerConfigStore
import com.example.persona.data.ApiConversationRepository
import com.example.persona.data.ApiPersonaRepository
import com.example.persona.data.ConversationDto
import com.example.persona.data.FakePersonaApi
import com.example.persona.data.PersonaDto
import com.example.persona.data.PersonaProfile
import com.example.persona.data.PersonaProfileStore
import com.example.persona.data.PollingChatRepository
import com.example.persona.data.RemotePersonaApi
import com.example.persona.data.RunStatus
import com.example.persona.ui.ChatScreen
import com.example.persona.ui.ConversationListScreen
import com.example.persona.ui.MessageUiModel
import com.example.persona.ui.PersonaEditScreen
import com.example.persona.ui.PersonaHomeScreen
import com.example.persona.ui.ServerSettingsScreen
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
    const val Settings = "settings"
    const val PersonaEdit = "persona-edit/{personaId}"
    const val Conversations = "conversations/{personaId}"
    const val Chat = "chat/{conversationId}"

    fun personaEdit(personaId: String): String = "persona-edit/$personaId"
    fun conversations(personaId: String): String = "conversations/$personaId"
    fun chat(conversationId: String): String = "chat/$conversationId"
}

@Composable
private fun PersonaClientApp() {
    val context = LocalContext.current
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()

    val serverConfigStore = remember { ServerConfigStore(context.applicationContext) }
    val personaProfileStore = remember { PersonaProfileStore(context.applicationContext) }
    var serverConfig by remember { mutableStateOf(serverConfigStore.load()) }
    var personaProfiles by remember { mutableStateOf(personaProfileStore.list()) }
    var statusText by remember { mutableStateOf("") }

    val api = remember(serverConfig) {
        if (serverConfig.isConfigured()) {
            RemotePersonaApi { serverConfig }
        } else {
            FakePersonaApi()
        }
    }
    val personaRepository = remember(api) { ApiPersonaRepository(api) }
    val conversationRepository = remember(api) { ApiConversationRepository(api) }
    val chatRepository = remember(api) { PollingChatRepository(api) }

    var personas by remember { mutableStateOf(emptyList<PersonaDto>()) }
    val conversationsByPersona = remember { mutableStateMapOf<String, List<ConversationDto>>() }
    val conversationById = remember { mutableStateMapOf<String, ConversationDto>() }
    val messagesByConversation = remember { mutableStateMapOf<String, List<MessageUiModel>>() }
    val runStatusByConversation = remember { mutableStateMapOf<String, String>() }

    fun syncPersonas() {
        scope.launch {
            try {
                personas = personaRepository.listPersonas()
                statusText = if (serverConfig.isConfigured()) {
                    "Synced ${personas.size} personas from server ${serverConfig.baseUrl}"
                } else {
                    "Using local demo data. Configure server settings to go live."
                }
            } catch (error: Exception) {
                statusText = "Sync failed: ${error.message ?: "unknown error"}"
            }
        }
    }

    LaunchedEffect(api) {
        syncPersonas()
    }

    NavHost(
        navController = navController,
        startDestination = Routes.Home,
    ) {
        composable(Routes.Home) {
            PersonaHomeScreen(
                personas = personas,
                statusText = statusText,
                onContinueLast = { personaId ->
                    scope.launch {
                        try {
                            val conversation = conversationRepository.continueLastConversation(personaId)
                            conversationById[conversation.conversationId] = ConversationDto(
                                conversationId = conversation.conversationId,
                                personaId = conversation.personaId,
                                title = conversation.title,
                            )
                            val messages = conversationRepository.listMessages(conversation.conversationId)
                            messagesByConversation[conversation.conversationId] = messages.map {
                                MessageUiModel(it.messageId, it.role, it.content)
                            }
                            runStatusByConversation[conversation.conversationId] = RunStatus.QUEUED.name.lowercase()
                            navController.navigate(Routes.chat(conversation.conversationId))
                        } catch (error: Exception) {
                            statusText = "Continue failed: ${error.message}"
                        }
                    }
                },
                onNewChat = { personaId ->
                    scope.launch {
                        try {
                            val conversation = conversationRepository.createConversation(personaId)
                            val dto = ConversationDto(
                                conversationId = conversation.conversationId,
                                personaId = conversation.personaId,
                                title = conversation.title,
                                lastMessagePreview = conversation.lastMessagePreview,
                                updatedAt = conversation.updatedAt,
                            )
                            conversationById[conversation.conversationId] = dto
                            conversationsByPersona[personaId] = listOf(dto) + conversationsByPersona[personaId].orEmpty()
                            messagesByConversation[conversation.conversationId] = emptyList()
                            runStatusByConversation[conversation.conversationId] = RunStatus.QUEUED.name.lowercase()
                            navController.navigate(Routes.chat(conversation.conversationId))
                        } catch (error: Exception) {
                            statusText = "Create chat failed: ${error.message}"
                        }
                    }
                },
                onOpenThreads = { personaId ->
                    scope.launch {
                        try {
                            val conversations = conversationRepository.listConversations(personaId)
                            conversationsByPersona[personaId] = conversations
                            conversations.forEach { conversation ->
                                conversationById[conversation.conversationId] = conversation
                            }
                            navController.navigate(Routes.conversations(personaId))
                        } catch (error: Exception) {
                            statusText = "Load threads failed: ${error.message}"
                        }
                    }
                },
                onEditPersona = { personaId ->
                    navController.navigate(Routes.personaEdit(personaId))
                },
                onSync = { syncPersonas() },
                onOpenSettings = { navController.navigate(Routes.Settings) },
            )
        }

        composable(Routes.Settings) {
            ServerSettingsScreen(
                initialConfig = serverConfig,
                onSave = { updated ->
                    serverConfig = sanitizeConfig(updated)
                    serverConfigStore.save(serverConfig)
                    statusText = "Saved server config for user ${serverConfig.userId}"
                    navController.popBackStack()
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.PersonaEdit,
            arguments = listOf(navArgument("personaId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val personaId = backStackEntry.arguments?.getString("personaId").orEmpty()
            val persona = personas.firstOrNull { it.personaId == personaId }
            PersonaEditScreen(
                personaId = personaId,
                personaDisplayName = persona?.displayName ?: personaId,
                initialProfile = personaProfiles[personaId],
                onSave = { profile: PersonaProfile ->
                    personaProfileStore.save(profile)
                    personaProfiles = personaProfileStore.list()
                    statusText = "Saved local profile for ${profile.personaId}"
                    navController.popBackStack()
                },
                onBack = { navController.popBackStack() },
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
                        try {
                            val messages = conversationRepository.listMessages(conversationId)
                            messagesByConversation[conversationId] = messages.map {
                                MessageUiModel(it.messageId, it.role, it.content)
                            }
                            runStatusByConversation.putIfAbsent(conversationId, RunStatus.QUEUED.name.lowercase())
                            navController.navigate(Routes.chat(conversationId))
                        } catch (error: Exception) {
                            statusText = "Load chat failed: ${error.message}"
                        }
                    }
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.Chat,
            arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val conversationId = backStackEntry.arguments?.getString("conversationId").orEmpty()
            val conversation = conversationById[conversationId]
            val personaId = conversation?.personaId.orEmpty()
            val personaName = personas.firstOrNull { it.personaId == personaId }?.displayName ?: "Persona Chat"
            val profileHint = personaProfiles[personaId]?.instructions?.take(42)
            val chatTitle = if (profileHint.isNullOrBlank()) personaName else "$personaName • $profileHint"

            ChatScreen(
                title = chatTitle,
                conversationId = conversationId,
                messages = messagesByConversation[conversationId].orEmpty(),
                pollingStatus = runStatusByConversation[conversationId] ?: "idle",
                onSendMessage = { text ->
                    scope.launch {
                        try {
                            val clientMessageId = UUID.randomUUID().toString()
                            runStatusByConversation[conversationId] = RunStatus.QUEUED.name.lowercase()
                            val run = chatRepository.sendAndAwaitReply(conversationId, text, clientMessageId)
                            runStatusByConversation[conversationId] = run.status
                            val messages = conversationRepository.listMessages(conversationId)
                            messagesByConversation[conversationId] = messages.map {
                                MessageUiModel(it.messageId, it.role, it.content)
                            }
                        } catch (error: Exception) {
                            runStatusByConversation[conversationId] = "failed"
                            statusText = "Send failed: ${error.message}"
                        }
                    }
                },
                onBack = { navController.popBackStack() },
            )
        }
    }
}

private fun sanitizeConfig(config: ServerConfig): ServerConfig {
    return config.copy(
        baseUrl = config.baseUrl.trim().trimEnd('/'),
        userId = config.userId.trim(),
    )
}
