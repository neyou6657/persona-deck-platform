# Android Persona Chat Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an Android app that lets users switch personas, continue the latest conversation for a persona, start a new conversation, send messages, and poll for replies.

**Architecture:** Build a small Jetpack Compose app with one networking layer and three primary screens: persona list/home, conversation list, and chat thread. Use polling for run completion in Phase 1 to match the backend plan.

**Tech Stack:** Kotlin, Jetpack Compose, Android Gradle, Retrofit or Ktor client, Kotlin coroutines, JUnit

---

### Task 1: Scaffold the Android app and define API models with failing tests

**Files:**
- Create: `/workspace/android-client/settings.gradle.kts`
- Create: `/workspace/android-client/build.gradle.kts`
- Create: `/workspace/android-client/app/build.gradle.kts`
- Create: `/workspace/android-client/app/src/test/java/com/example/persona/ApiModelTest.kt`

- [ ] **Step 1: Create the Gradle settings file**

```kotlin
rootProject.name = "android-client"
include(":app")
```

- [ ] **Step 2: Create the app test with failing DTO expectations**

```kotlin
@Test
fun continueLastResponseMapsConversationId() {
    val dto = ContinueLastConversationResponse(
        conversationId = "conv-1",
        personaId = "coder",
        title = "Latest"
    )
    assertEquals("conv-1", dto.conversationId)
}
```

- [ ] **Step 3: Run the test to verify failure**

Run: `cd /workspace/android-client && ./gradlew testDebugUnitTest`
Expected: FAIL because the project and DTOs do not exist yet.

- [ ] **Step 4: Add build config with Compose and coroutines**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
```

- [ ] **Step 5: Commit the scaffold**

```bash
git -C /workspace add android-client
git -C /workspace commit -m "chore: scaffold android persona client"
```

### Task 2: Implement API client and repository for personas, conversations, messages, and runs

**Files:**
- Create: `/workspace/android-client/app/src/main/java/com/example/persona/data/ApiModels.kt`
- Create: `/workspace/android-client/app/src/main/java/com/example/persona/data/PersonaApi.kt`
- Create: `/workspace/android-client/app/src/main/java/com/example/persona/data/PersonaRepository.kt`
- Modify: `/workspace/android-client/app/src/test/java/com/example/persona/ApiModelTest.kt`

- [ ] **Step 1: Define DTOs for Phase 1 backend contracts**

```kotlin
data class PersonaDto(val personaId: String, val displayName: String, val online: Boolean)
data class ConversationDto(val conversationId: String, val personaId: String, val title: String?)
data class RunDto(val runId: String, val conversationId: String, val status: String, val assistantMessageId: String?)
```

- [ ] **Step 2: Define the HTTP API interface**

```kotlin
interface PersonaApi {
    suspend fun listPersonas(): List<PersonaDto>
    suspend fun continueLast(personaId: String): ConversationDto
    suspend fun createConversation(personaId: String): ConversationDto
    suspend fun sendMessage(conversationId: String, body: SendMessageRequest): AcceptedRunDto
    suspend fun getRun(runId: String): RunDto
}
```

- [ ] **Step 3: Implement a repository with polling**

```kotlin
suspend fun sendAndAwaitReply(conversationId: String, text: String, clientMessageId: String): RunDto {
    val accepted = api.sendMessage(conversationId, SendMessageRequest(clientMessageId, text))
    while (true) {
        val run = api.getRun(accepted.runId)
        if (run.status in listOf("completed", "failed", "timed_out")) return run
        delay(1000)
    }
}
```

- [ ] **Step 4: Run unit tests**

Run: `cd /workspace/android-client && ./gradlew testDebugUnitTest`
Expected: PASS

- [ ] **Step 5: Commit the client data layer**

```bash
git -C /workspace add android-client/app
git -C /workspace commit -m "feat: add android persona api client"
```

### Task 3: Build Compose screens for persona switch, continue-last, new chat, and chat thread

**Files:**
- Create: `/workspace/android-client/app/src/main/java/com/example/persona/ui/PersonaHomeScreen.kt`
- Create: `/workspace/android-client/app/src/main/java/com/example/persona/ui/ConversationListScreen.kt`
- Create: `/workspace/android-client/app/src/main/java/com/example/persona/ui/ChatScreen.kt`
- Create: `/workspace/android-client/app/src/main/java/com/example/persona/MainActivity.kt`

- [ ] **Step 1: Build the persona home screen**

```kotlin
@Composable
fun PersonaHomeScreen(
    personas: List<PersonaDto>,
    onContinueLast: (String) -> Unit,
    onNewChat: (String) -> Unit,
    onOpenThreads: (String) -> Unit,
) {
    LazyColumn {
        items(personas) { persona ->
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(persona.displayName)
                Row {
                    Button(onClick = { onContinueLast(persona.personaId) }) { Text("Continue") }
                    Button(onClick = { onNewChat(persona.personaId) }) { Text("New") }
                    Button(onClick = { onOpenThreads(persona.personaId) }) { Text("Threads") }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Build the conversation list screen**

```kotlin
@Composable
fun ConversationListScreen(
    conversations: List<ConversationDto>,
    onOpenConversation: (String) -> Unit,
) {
    LazyColumn {
        items(conversations) { conversation ->
            ListItem(
                headlineContent = { Text(conversation.title ?: "Untitled chat") },
                supportingContent = { Text(conversation.conversationId) },
                modifier = Modifier.clickable { onOpenConversation(conversation.conversationId) },
            )
        }
    }
}
```

- [ ] **Step 3: Build the chat screen with send box and polling state**

```kotlin
@Composable
fun ChatScreen(
    messages: List<MessageUiModel>,
    onSendMessage: (String) -> Unit,
) {
    var input by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f)) {
            items(messages) { message ->
                Text("${message.role}: ${message.content}", modifier = Modifier.padding(12.dp))
            }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp)) {
            TextField(value = input, onValueChange = { input = it }, modifier = Modifier.weight(1f))
            Button(onClick = { onSendMessage(input); input = "" }) { Text("Send") }
        }
    }
}
```

- [ ] **Step 4: Wire navigation in `MainActivity`**

```kotlin
setContent {
    MaterialTheme {
        PersonaAppNavHost()
    }
}
```

- [ ] **Step 5: Run app tests and assemble debug APK**

Run: `cd /workspace/android-client && ./gradlew testDebugUnitTest assembleDebug`
Expected: PASS

- [ ] **Step 6: Commit the first Android UI flow**

```bash
git -C /workspace add android-client/app/src
git -C /workspace commit -m "feat: add android persona chat flows"
```
