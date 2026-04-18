package me.rerere.rikkahub.ui.pages.relay

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.rerere.hugeicons.HugeIcons
import me.rerere.hugeicons.stroke.Add01
import me.rerere.hugeicons.stroke.Refresh01
import me.rerere.rikkahub.Screen
import me.rerere.rikkahub.data.relay.RelayConversationDto
import me.rerere.rikkahub.ui.components.nav.BackButton
import me.rerere.rikkahub.ui.context.LocalNavController
import me.rerere.rikkahub.ui.theme.CustomColors
import me.rerere.rikkahub.utils.plus
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

@Composable
fun RelayConversationListPage(
    personaId: String,
    personaName: String,
) {
    val navController = LocalNavController.current
    val vm: RelayConversationListVM = koinViewModel(
        parameters = { parametersOf(personaId, personaName) }
    )
    val conversations = vm.conversations.collectAsStateWithLifecycle()
    val isLoading = vm.isLoading.collectAsStateWithLifecycle()
    val errorMessage = vm.errorMessage.collectAsStateWithLifecycle()
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

    Scaffold(
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text(personaName) },
                navigationIcon = { BackButton() },
                scrollBehavior = scrollBehavior,
                colors = CustomColors.topBarColors,
                actions = {
                    IconButton(onClick = { vm.refresh() }) {
                        Icon(HugeIcons.Refresh01, contentDescription = "Refresh")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    navController.navigate(
                        Screen.RelayChat(
                            personaId = personaId,
                            personaName = personaName,
                            conversationId = null,
                            title = null,
                            createNew = true,
                        )
                    )
                }
            ) {
                Icon(HugeIcons.Add01, contentDescription = "New chat")
            }
        },
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = CustomColors.topBarColors.containerColor,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = innerPadding + PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                isLoading.value -> {
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            CircularProgressIndicator(modifier = Modifier.padding(20.dp))
                        }
                    }
                }

                !errorMessage.value.isNullOrBlank() -> {
                    item {
                        InfoCard(
                            title = "会话列表加载失败",
                            body = errorMessage.value ?: "Unknown error",
                        )
                    }
                }

                conversations.value.isEmpty() -> {
                    item {
                        InfoCard(
                            title = "还没有会话",
                            body = "这个人格暂时没有历史线程。点右下角开一个新坑就行。",
                        )
                    }
                }

                else -> {
                    items(conversations.value, key = { it.conversationId }) { conversation ->
                        ConversationCard(
                            conversation = conversation,
                            onClick = {
                                navController.navigate(
                                    Screen.RelayChat(
                                        personaId = personaId,
                                        personaName = personaName,
                                        conversationId = conversation.conversationId,
                                        title = conversation.title,
                                        createNew = false,
                                    )
                                )
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationCard(
    conversation: RelayConversationDto,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = conversation.title?.ifBlank { "Untitled chat" } ?: "Untitled chat",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = conversation.conversationId,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            val preview = conversation.lastMessagePreview?.ifBlank { "这条线程还没留下有效预览。" }
                ?: "这条线程还没留下有效预览。"
            Text(
                text = preview,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun InfoCard(
    title: String,
    body: String,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
