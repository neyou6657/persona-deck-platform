package me.rerere.rikkahub.ui.pages.relay

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.rerere.rikkahub.data.relay.RelayConversationDto
import me.rerere.rikkahub.data.relay.RelayConversationRepository

class RelayConversationListVM(
    private val personaId: String,
    val personaName: String,
    private val relayConversationRepository: RelayConversationRepository,
) : ViewModel() {
    private val _conversations = MutableStateFlow<List<RelayConversationDto>>(emptyList())
    val conversations: StateFlow<List<RelayConversationDto>> = _conversations.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            runCatching {
                relayConversationRepository.listConversations(personaId)
            }.onSuccess { items ->
                _conversations.value = items
            }.onFailure { error ->
                _conversations.value = emptyList()
                _errorMessage.value = error.message ?: "Failed to load conversations"
            }
            _isLoading.value = false
        }
    }
}
