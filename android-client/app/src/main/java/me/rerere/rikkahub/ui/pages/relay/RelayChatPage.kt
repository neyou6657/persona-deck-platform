package me.rerere.rikkahub.ui.pages.relay

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.rerere.hugeicons.HugeIcons
import me.rerere.hugeicons.stroke.Refresh01
import me.rerere.rikkahub.data.relay.RelayMessageDto
import me.rerere.rikkahub.ui.components.nav.BackButton
import me.rerere.rikkahub.ui.hooks.rememberImeAwareBottomInset
import me.rerere.rikkahub.ui.theme.CustomColors
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

@Composable
fun RelayChatPage(
    personaId: String,
    personaName: String,
    conversationId: String?,
    title: String?,
    createNew: Boolean,
) {
    val vm: RelayChatVM = koinViewModel(
        parameters = {
            parametersOf(
                personaId,
                personaName,
                conversationId.orEmpty(),
                title.orEmpty(),
                createNew,
            )
        }
    )
    val resolvedConversationId = vm.conversationId.collectAsStateWithLifecycle()
    val resolvedTitle = vm.title.collectAsStateWithLifecycle()
    val messages = vm.messages.collectAsStateWithLifecycle()
    val isLoading = vm.isLoading.collectAsStateWithLifecycle()
    val isSending = vm.isSending.collectAsStateWithLifecycle()
    val status = vm.status.collectAsStateWithLifecycle()
    val errorMessage = vm.errorMessage.collectAsStateWithLifecycle()
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val listState = rememberLazyListState()
    var input by rememberSaveable { mutableStateOf("") }
    val inputBottomInset = rememberImeAwareBottomInset()

    LaunchedEffect(messages.value.size) {
        if (messages.value.isNotEmpty()) {
            listState.animateScrollToItem(messages.value.lastIndex)
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal),
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text(resolvedTitle.value) },
                navigationIcon = { BackButton() },
                scrollBehavior = scrollBehavior,
                colors = CustomColors.topBarColors,
                actions = {
                    IconButton(onClick = { vm.refreshMessages() }) {
                        Icon(HugeIcons.Refresh01, contentDescription = "Refresh")
                    }
                },
            )
        },
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = CustomColors.topBarColors.containerColor,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding)
                .padding(horizontal = 16.dp)
                .padding(top = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(personaName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        text = resolvedConversationId.value ?: "正在准备会话...",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = when {
                            isSending.value -> "Agent 正在处理，别急，它不是在泡面。"
                            isLoading.value -> "正在同步消息…"
                            else -> "当前状态: ${status.value}"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (!errorMessage.value.isNullOrBlank()) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("发送失败", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(errorMessage.value ?: "Unknown error", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = { vm.clearError() }) {
                            Text("知道了")
                        }
                    }
                }
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                when {
                    isLoading.value && messages.value.isEmpty() -> {
                        CircularProgressIndicator(modifier = Modifier.padding(20.dp))
                    }

                    messages.value.isEmpty() -> {
                        Text(
                            text = "这里还没有消息。现在轮到你先开口。",
                            modifier = Modifier.padding(20.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    else -> {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items(messages.value, key = { it.messageId }) { message ->
                                MessageBubble(message = message)
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp + inputBottomInset),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    label = { Text("给人格发消息") },
                    minLines = 2,
                    maxLines = 5,
                    enabled = resolvedConversationId.value != null && !isSending.value,
                )
                Button(
                    onClick = {
                        val trimmed = input.trim()
                        if (trimmed.isNotEmpty()) {
                            vm.sendMessage(trimmed)
                            input = ""
                        }
                    },
                    enabled = resolvedConversationId.value != null && !isSending.value,
                ) {
                    Text("发送")
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: RelayMessageDto) {
    val assistant = message.role == "assistant"
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (assistant) Alignment.Start else Alignment.End,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = if (assistant) "Agent" else "You",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = message.content,
            modifier = Modifier
                .background(
                    color = if (assistant) {
                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.88f)
                    } else {
                        MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.88f)
                    },
                    shape = RoundedCornerShape(
                        topStart = 24.dp,
                        topEnd = 24.dp,
                        bottomStart = if (assistant) 8.dp else 24.dp,
                        bottomEnd = if (assistant) 24.dp else 8.dp,
                    )
                )
                .padding(16.dp),
        )
    }
}
