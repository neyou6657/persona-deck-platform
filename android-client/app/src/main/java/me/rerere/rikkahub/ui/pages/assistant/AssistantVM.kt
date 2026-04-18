package me.rerere.rikkahub.ui.pages.assistant

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.rerere.rikkahub.data.relay.RelayConfigStore
import me.rerere.rikkahub.data.relay.RelayPersonaDto
import me.rerere.rikkahub.data.relay.RelayPersonaRepository
import me.rerere.rikkahub.data.relay.RelayServerConfig

class AssistantVM(
    private val relayConfigStore: RelayConfigStore,
    private val relayPersonaRepository: RelayPersonaRepository,
) : ViewModel() {
    private val _config = MutableStateFlow(relayConfigStore.load())
    val config: StateFlow<RelayServerConfig> = _config.asStateFlow()

    private val _personas = MutableStateFlow<List<RelayPersonaDto>>(emptyList())
    val personas: StateFlow<List<RelayPersonaDto>> = _personas.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _config.value = relayConfigStore.load()
        if (!_config.value.isConfigured()) {
            _personas.value = emptyList()
            _errorMessage.value = null
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            runCatching {
                relayPersonaRepository.listPersonas()
                    .sortedWith(
                        compareByDescending<RelayPersonaDto> { it.online }
                            .thenBy { it.displayName.lowercase() }
                    )
            }.onSuccess { personas ->
                _personas.value = personas
            }.onFailure { error ->
                _personas.value = emptyList()
                _errorMessage.value = error.message ?: "Failed to load personas"
            }
            _isLoading.value = false
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
