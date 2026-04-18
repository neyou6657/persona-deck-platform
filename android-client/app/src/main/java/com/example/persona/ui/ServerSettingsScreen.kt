package com.example.persona.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.persona.config.ServerConfig
import kotlinx.coroutines.launch

@Composable
fun ServerSettingsScreen(
    initialConfig: ServerConfig,
    onSave: (ServerConfig) -> Unit,
    onTestConnection: suspend (ServerConfig) -> String,
    onBack: () -> Unit,
) {
    var baseUrl by remember { mutableStateOf(initialConfig.baseUrl) }
    var userId by remember { mutableStateOf(initialConfig.userId) }
    var password by remember { mutableStateOf(initialConfig.password) }
    var diagnostics by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    DeckBackground {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DeckPanel {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DeckBadge(
                        text = "Relay Control",
                        tone = DeckBadgeTone.Accent,
                    )
                    Text(
                        text = "服务器设置",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        text = "把这里当成 Deno 入口配置页。URL、管理密码和你的用户 ID 都在这里落地，客户端自己记住，不上交给别人。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
                            Text(
                                text = "返回",
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                        Button(
                            onClick = {
                                onSave(
                                    ServerConfig(
                                        baseUrl = baseUrl,
                                        password = password,
                                        userId = userId,
                                    ),
                                )
                            },
                        ) {
                            Icon(Icons.Outlined.Save, contentDescription = null)
                            Text(
                                text = "保存配置",
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }

            DeckPanel {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(
                        text = "连接参数",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it },
                        label = { Text("Deno URL") },
                        leadingIcon = { Icon(Icons.Outlined.Public, contentDescription = null) },
                        placeholder = { Text("https://persona-deck-relay-xxxx.deno.net") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = userId,
                        onValueChange = { userId = it },
                        label = { Text("用户 ID") },
                        leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null) },
                        placeholder = { Text("demo-user-001") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("认证密码") },
                        leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
                        placeholder = { Text("用于登录和调用接口") },
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            }

            DeckPanel {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "诊断",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                diagnostics = onTestConnection(
                                    ServerConfig(
                                        baseUrl = baseUrl,
                                        password = password,
                                        userId = userId,
                                    ),
                                )
                            }
                        },
                    ) {
                        Text("测试连接")
                    }
                    if (diagnostics.isNotBlank()) {
                        Text(
                            text = diagnostics,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            DeckPanel {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "使用提示",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "1. URL 填 Deno 根地址，不要乱加路径。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = "2. 用户 ID 是客户端侧线程归属，不是人格 ID。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = "3. 先保存，再回首页点同步；同步到了人格，界面才像样。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
