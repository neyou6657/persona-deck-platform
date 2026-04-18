package me.rerere.rikkahub.ui.pages.assistant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.rerere.hugeicons.HugeIcons
import me.rerere.hugeicons.stroke.Add01
import me.rerere.hugeicons.stroke.LeftToRightListBullet
import me.rerere.hugeicons.stroke.Refresh01
import me.rerere.hugeicons.stroke.Settings03
import me.rerere.rikkahub.Screen
import me.rerere.rikkahub.data.relay.RelayPersonaDto
import me.rerere.rikkahub.ui.context.LocalNavController
import me.rerere.rikkahub.ui.theme.CustomColors
import me.rerere.rikkahub.utils.plus
import org.koin.androidx.compose.koinViewModel

@Composable
fun AssistantPage(vm: AssistantVM = koinViewModel()) {
    val navController = LocalNavController.current
    val personas = vm.personas.collectAsStateWithLifecycle()
    val config = vm.config.collectAsStateWithLifecycle()
    val isLoading = vm.isLoading.collectAsStateWithLifecycle()
    val errorMessage = vm.errorMessage.collectAsStateWithLifecycle()
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

    Scaffold(
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text("Persona Deck") },
                scrollBehavior = scrollBehavior,
                colors = CustomColors.topBarColors,
                actions = {
                    IconButton(onClick = { vm.refresh() }) {
                        Icon(HugeIcons.Refresh01, contentDescription = "Refresh")
                    }
                    IconButton(onClick = { navController.navigate(Screen.Setting) }) {
                        Icon(HugeIcons.Settings03, contentDescription = "Settings")
                    }
                },
            )
        },
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = CustomColors.topBarColors.containerColor,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = innerPadding + PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                HeroCard(
                    configured = config.value.isConfigured(),
                    baseUrl = config.value.normalizedBaseUrl(),
                    onOpenSettings = { navController.navigate(Screen.Setting) },
                    onRefresh = { vm.refresh() },
                )
            }

            when {
                !config.value.isConfigured() -> {
                    item {
                        EmptyCard(
                            title = "先把 Deno 连上",
                            body = "还没配置 Deno Relay 地址。先点右上角设置，不然人格列表只能表演空气魔术。",
                            actionLabel = "打开设置",
                            onAction = { navController.navigate(Screen.Setting) },
                        )
                    }
                }

                isLoading.value -> {
                    item {
                        LoadingCard()
                    }
                }

                !errorMessage.value.isNullOrBlank() -> {
                    item {
                        EmptyCard(
                            title = "人格同步失败",
                            body = errorMessage.value ?: "Unknown error",
                            actionLabel = "重试",
                            onAction = { vm.refresh() },
                        )
                    }
                }

                personas.value.isEmpty() -> {
                    item {
                        EmptyCard(
                            title = "没有可用人格",
                            body = "Deno 端目前没回任何人格，或者代理人格还没上线。先去后端看看人是不是都在摸鱼。",
                            actionLabel = "重新同步",
                            onAction = { vm.refresh() },
                        )
                    }
                }

                else -> {
                    items(personas.value, key = { it.personaId }) { persona ->
                        PersonaCard(
                            persona = persona,
                            onContinue = {
                                navController.navigate(
                                    Screen.RelayChat(
                                        personaId = persona.personaId,
                                        personaName = persona.displayName,
                                        conversationId = null,
                                        title = null,
                                        createNew = false,
                                    )
                                )
                            },
                            onNewChat = {
                                navController.navigate(
                                    Screen.RelayChat(
                                        personaId = persona.personaId,
                                        personaName = persona.displayName,
                                        conversationId = null,
                                        title = null,
                                        createNew = true,
                                    )
                                )
                            },
                            onThreads = {
                                navController.navigate(
                                    Screen.RelayConversations(
                                        personaId = persona.personaId,
                                        personaName = persona.displayName,
                                    )
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HeroCard(
    configured: Boolean,
    baseUrl: String,
    onOpenSettings: () -> Unit,
    onRefresh: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        )
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "多个数字人格，一个 Deno 中控",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
            )
            Text(
                text = if (configured) {
                    "当前 Relay: $baseUrl"
                } else {
                    "配置好 Relay 后，这里就能列出 Hugging Face 那头主动连过来的各个人格。"
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onRefresh, enabled = configured) {
                    Text("同步人格")
                }
                OutlinedButton(onClick = onOpenSettings) {
                    Text("Relay 设置")
                }
            }
        }
    }
}

@Composable
private fun LoadingCard() {
    Card {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator()
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("正在同步人格")
                Text(
                    "上游壳子已经点亮，现在轮到 Deno 把人叫出来。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun EmptyCard(
    title: String,
    body: String,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Card {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = onAction) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
private fun PersonaCard(
    persona: RelayPersonaDto,
    onContinue: () -> Unit,
    onNewChat: () -> Unit,
    onThreads: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
        )
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        persona.displayName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        persona.personaId,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = persona.description?.ifBlank { "这个人格目前没写说明。沉默是金，也可能是后端没填。" }
                            ?: "这个人格目前没写说明。沉默是金，也可能是后端没填。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = if (persona.online) "在线" else "离线",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (persona.online) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(onClick = onContinue, enabled = persona.online) {
                    Text("接着聊")
                }
                ElevatedButton(onClick = onNewChat, enabled = persona.online) {
                    Icon(HugeIcons.Add01, contentDescription = null)
                    Text("新对话", modifier = Modifier.padding(start = 6.dp))
                }
                OutlinedButton(onClick = onThreads) {
                    Icon(HugeIcons.LeftToRightListBullet, contentDescription = null)
                    Text("会话", modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
    }
}
