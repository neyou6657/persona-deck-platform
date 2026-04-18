package me.rerere.rikkahub.ui.pages.relay

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.rerere.rikkahub.data.relay.RelayConversationRepository
import me.rerere.rikkahub.data.relay.RelayMessageDto
import me.rerere.rikkahub.data.relay.RelayPollingChatRepository
import java.util.UUID

class RelayChatVM(
    private val personaId: String,
    val personaName: String,
    initialConversationId: String,
    initialTitle: String,
    private val createNew: Boolean,
    private val relayConversationRepository: RelayConversationRepository,
    private val relayChatRepository: RelayPollingChatRepository,
) : ViewModel() {
    private val _conversationId = MutableStateFlow(initialConversationId.ifBlank { null })
    val conversationId: StateFlow<String?> = _conversationId.asStateFlow()

    private val _title = MutableStateFlow(initialTitle.ifBlank { personaName })
    val title: StateFlow<String> = _title.asStateFlow()

    private val _messages = MutableStateFlow<List<RelayMessageDto>>(emptyList())
    val messages: StateFlow<List<RelayMessageDto>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending.asStateFlow()

    private val _status = MutableStateFlow("idle")
    val status: StateFlow<String> = _status.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    init {
        bootstrapConversation()
    }

    fun refreshMessages() {
        val currentConversationId = _conversationId.value ?: return
        viewModelScope.launch {
            _isLoading.value = true
            runCatching {
                relayConversationRepository.listMessages(currentConversationId)
            }.onSuccess { items ->
                _messages.value = items
            }.onFailure { error ->
                _errorMessage.value = error.message ?: "Failed to load messages"
            }
            _isLoading.value = false
        }
    }

    fun sendMessage(text: String) {
        val currentConversationId = _conversationId.value ?: return
        val trimmed = text.trim()
        if (trimmed.isEmpty() || _isSending.value) return

        viewModelScope.launch {
            _isSending.value = true
            _status.value = "queued"
            _errorMessage.value = null

            val optimisticMessage = RelayMessageDto(
                messageId = "local-${UUID.randomUUID()}",
                conversationId = currentConversationId,
                role = "user",
                content = trimmed,
                createdAt = null,
            )
            _messages.value = _messages.value + optimisticMessage

            runCatching {
                relayChatRepository.sendAndAwaitReply(
                    conversationId = currentConversationId,
                    text = trimmed,
                    clientMessageId = UUID.randomUUID().toString(),
                )
            }.onSuccess { run ->
                _status.value = run.status
                refreshMessages()
                if (run.error != null) {
                    _errorMessage.value = run.error
                }
            }.onFailure { error ->
                _status.value = "failed"
                _errorMessage.value = error.message ?: "Send failed"
            }

            _isSending.value = false
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }

    private fun bootstrapConversation() {
        viewModelScope.launch {
            if (_conversationId.value != null) {
                refreshMessages()
                return@launch
            }

            _isLoading.value = true
            _errorMessage.value = null
            runCatching {
                if (createNew) {
                    relayConversationRepository.createConversation(personaId)
                } else {
                    val conversation = relayConversationRepository.continueLastConversation(personaId)
                    me.rerere.rikkahub.data.relay.RelayConversationDto(
                        conversationId = conversation.conversationId,
                        personaId = conversation.personaId,
                        title = conversation.title,
                        lastMessagePreview = null,
                        updatedAt = null,
                    )
                }
            }.onSuccess { conversation ->
                _conversationId.value = conversation.conversationId
                _title.value = conversation.title?.ifBlank { personaName } ?: personaName
                refreshMessages()
            }.onFailure { error ->
                _errorMessage.value = error.message ?: "Failed to prepare conversation"
            }
            _isLoading.value = false
        }
    }
}
