package me.rerere.rikkahub.ui.pages.setting

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.dokar.sonner.ToastType
import me.rerere.hugeicons.HugeIcons
import me.rerere.hugeicons.stroke.Copy01
import me.rerere.hugeicons.stroke.Refresh01
import me.rerere.hugeicons.stroke.View
import me.rerere.hugeicons.stroke.ViewOff
import me.rerere.rikkahub.R
import me.rerere.rikkahub.data.relay.RelayConfigStore
import me.rerere.rikkahub.data.relay.RelayServerConfig
import me.rerere.rikkahub.ui.components.nav.BackButton
import me.rerere.rikkahub.ui.context.LocalToaster
import me.rerere.rikkahub.ui.theme.CustomColors
import me.rerere.rikkahub.utils.plus
import org.koin.compose.koinInject
import java.util.UUID

@Composable
fun SettingWebPage() {
    val relayConfigStore: RelayConfigStore = koinInject()
    val clipboardManager = LocalClipboardManager.current
    val toaster = LocalToaster.current
    val initialConfig = relayConfigStore.load()
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

    var baseUrl by rememberSaveable { mutableStateOf(initialConfig.baseUrl) }
    var accessPassword by rememberSaveable { mutableStateOf(initialConfig.accessPassword) }
    var userId by rememberSaveable { mutableStateOf(initialConfig.userId) }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }

    fun saveConfig(showToast: Boolean = true) {
        val config = RelayServerConfig(
            baseUrl = baseUrl,
            accessPassword = accessPassword,
            userId = userId,
        )
        relayConfigStore.save(config)
        baseUrl = config.normalizedBaseUrl()
        userId = relayConfigStore.load().userId
        if (showToast) {
            toaster.show("Relay config saved", type = ToastType.Success)
        }
    }

    Scaffold(
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text("Deno Relay") },
                navigationIcon = { BackButton() },
                scrollBehavior = scrollBehavior,
                colors = CustomColors.topBarColors,
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
                Card(modifier = Modifier.fillMaxWidth()) {
                    androidx.compose.foundation.layout.Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = "客户端只认 Deno，不直接认 HF Agent",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            text = "HF Space 只会主动连 Deno。你这边客户端只需要填 Relay 地址和密码，剩下的人格、会话、聊天都走这个入口。",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    androidx.compose.foundation.layout.Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        OutlinedTextField(
                            value = baseUrl,
                            onValueChange = { baseUrl = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Relay Base URL") },
                            placeholder = { Text("https://persona-deck-relay-xxxx.deno.net") },
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = accessPassword,
                            onValueChange = { accessPassword = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Access Password") },
                            singleLine = true,
                            visualTransformation = if (passwordVisible) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            trailingIcon = {
                                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                    Icon(
                                        imageVector = if (passwordVisible) HugeIcons.ViewOff else HugeIcons.View,
                                        contentDescription = "Toggle password",
                                    )
                                }
                            },
                        )
                        OutlinedTextField(
                            value = userId,
                            onValueChange = { userId = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Client User ID") },
                            singleLine = true,
                            trailingIcon = {
                                androidx.compose.foundation.layout.Row {
                                    IconButton(
                                        onClick = {
                                            clipboardManager.setText(AnnotatedString(userId))
                                            toaster.show("User ID copied")
                                        }
                                    ) {
                                        Icon(HugeIcons.Copy01, contentDescription = "Copy")
                                    }
                                    IconButton(
                                        onClick = {
                                            userId = "android-${UUID.randomUUID()}"
                                        }
                                    ) {
                                        Icon(HugeIcons.Refresh01, contentDescription = "Regenerate")
                                    }
                                }
                            },
                        )
                        Button(
                            onClick = { saveConfig() },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = baseUrl.trim().isNotBlank() && userId.trim().isNotBlank(),
                        ) {
                            Text("保存连接配置")
                        }
                    }
                }
            }
        }
    }
}
