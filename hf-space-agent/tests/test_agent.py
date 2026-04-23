import json
import unittest
from unittest.mock import patch

from agent import AgentClient, AgentError, OpenAIError, RelayBridge


class _FakeUsage:
    def __init__(self, input_tokens: int, output_tokens: int):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.total_tokens = input_tokens + output_tokens

    def model_dump(self):
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
        }


class _FakeResponse:
    def __init__(self, response_id: str, output_text: str, model: str = "gpt-5.3-codex"):
        self.id = response_id
        self.output_text = output_text
        self.model = model
        self.usage = _FakeUsage(input_tokens=11, output_tokens=7)

    def model_dump(self):
        return {
            "id": self.id,
            "model": self.model,
            "output_text": self.output_text,
            "usage": self.usage.model_dump(),
        }


class _FakeResponsesAPI:
    def __init__(self, owner):
        self._owner = owner
        self.calls = []
        self._counter = 0

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        self._counter += 1
        return _FakeResponse(
            response_id=f"resp-{self._counter}",
            output_text=f"sdk reply #{self._counter}",
        )


class _FakeStream:
    def __init__(self, events, final_response):
        self._events = list(events)
        self._final_response = final_response

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._events:
            raise StopAsyncIteration
        return self._events.pop(0)

    async def get_final_response(self):
        return self._final_response


class _FakeStreamContext:
    def __init__(self, stream):
        self._stream = stream

    async def __aenter__(self):
        return self._stream

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeAsyncOpenAI:
    def __init__(self, **kwargs):
        self.init_kwargs = kwargs
        self.responses = _FakeResponsesAPI(self)


class _FakeWebSocket:
    def __init__(self):
        self.sent_messages = []

    async def send(self, text):
        self.sent_messages.append(text)


class _FakeGeneratingClient:
    def __init__(self):
        self.calls = []

    async def generate(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "reply": "protocol reply",
            "response_id": "resp-generated",
            "model": "gpt-5.3-codex",
            "usage": {"total_tokens": 1},
            "raw": {"ok": True},
        }


class _FakeCodexRunner:
    def __init__(self, config):
        self.config = config
        self.calls = []

    async def run(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "reply": "codex cli reply",
            "response_id": "codex-resp-1",
            "model": "gpt-5.3-codex",
            "usage": None,
            "raw": {"runtime": "codex_cli"},
            "session_id": kwargs.get("session_id"),
        }


class _FakeOpenCodeRunner:
    def __init__(self, config):
        self.config = config
        self.calls = []

    async def run(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "reply": "opencode cli reply",
            "response_id": "opencode-ses-1",
            "model": "openrouter/claude-sonnet",
            "usage": None,
            "raw": {"runtime": "opencode_cli"},
            "session_id": kwargs.get("session_id"),
        }


class AgentClientTest(unittest.IsolatedAsyncioTestCase):
    async def test_build_registration_message_uses_persona_env(self):
        with patch.dict(
            "os.environ",
            {
                "AGENT_ID": "hf-space-coder-v1",
                "AGENT_INSTANCE_ID": "instance-xyz",
                "AGENT_PERSONA_IDS": "coder, reviewer",
                "AGENT_VERSION": "2026-04-18",
            },
            clear=False,
        ):
            client = AgentClient.from_env()
            message = client.build_registration_message()

        self.assertEqual(message["type"], "agent_register")
        self.assertEqual(message["agentId"], "hf-space-coder-v1")
        self.assertEqual(message["instanceId"], "instance-xyz")
        self.assertEqual(message["personaIds"], ["coder", "reviewer"])
        self.assertEqual(message["version"], "2026-04-18")
        self.assertEqual(message["capabilities"]["stream"], False)
        self.assertEqual(message["capabilities"]["tools"], False)
        self.assertEqual(message["capabilities"]["runtime"], client.runtime)
        self.assertEqual(message["capabilities"]["model"], client.model)
        self.assertEqual(message["capabilities"]["observedRestartGeneration"], 0)

    async def test_generate_uses_official_responses_sdk_and_preserves_session_continuity(self):
        fake_instances = []

        def _fake_openai_factory(**kwargs):
            instance = _FakeAsyncOpenAI(**kwargs)
            fake_instances.append(instance)
            return instance

        with patch("agent.AsyncOpenAI", side_effect=_fake_openai_factory):
            with patch.dict(
                "os.environ",
                {
                    "AGENT_RUNTIME": "responses",
                    "AGENT_PROVIDER": "openai",
                    "AGENT_MODEL": "gpt-5.3-codex",
                    "AGENT_API_KEY": "test-key",
                    "AGENT_API_BASE_URL": "https://example.invalid/v1",
                    "AGENT_TIMEOUT_SECONDS": "42",
                    "AGENT_TEMPERATURE": "0.3",
                    "AGENT_API_KIND": "responses",
                },
                clear=False,
            ):
                client = AgentClient.from_env()
                first = await client.generate(
                    prompt="first prompt",
                    session_id="relay-session-1",
                    metadata={"tenant": "alpha"},
                    previous_response_id=None,
                )
                second = await client.generate(
                    prompt="second prompt",
                    session_id="relay-session-1",
                    metadata={},
                    previous_response_id=None,
                )

        self.assertEqual(len(fake_instances), 1)
        self.assertEqual(
            fake_instances[0].init_kwargs,
            {
                "api_key": "test-key",
                "base_url": "https://example.invalid/v1",
                "timeout": 42.0,
            },
        )

        calls = fake_instances[0].responses.calls
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["model"], "gpt-5.3-codex")
        self.assertEqual(calls[0]["input"], "first prompt")
        self.assertEqual(calls[0]["instructions"], client.system_prompt)
        self.assertEqual(calls[0]["temperature"], 0.3)
        self.assertEqual(calls[0]["store"], True)
        self.assertIsNone(calls[0]["previous_response_id"])
        self.assertNotIn("metadata", calls[0])

        self.assertEqual(calls[1]["previous_response_id"], "resp-1")
        self.assertEqual(first["reply"], "sdk reply #1")
        self.assertEqual(second["reply"], "sdk reply #2")
        self.assertEqual(second["session_id"], "relay-session-1")
        self.assertEqual(second["response_id"], "resp-2")
        self.assertEqual(second["usage"]["total_tokens"], 18)

    async def test_generate_prefers_explicit_previous_response_id_from_relay_prompt(self):
        fake_instances = []

        def _fake_openai_factory(**kwargs):
            instance = _FakeAsyncOpenAI(**kwargs)
            fake_instances.append(instance)
            return instance

        with patch("agent.AsyncOpenAI", side_effect=_fake_openai_factory):
            with patch.dict(
                "os.environ",
                {
                    "AGENT_RUNTIME": "responses",
                    "AGENT_API_KEY": "test-key",
                },
                clear=False,
            ):
                client = AgentClient.from_env()
                result = await client.generate(
                    prompt="fresh prompt",
                    session_id="legacy-session",
                    metadata={},
                    previous_response_id="resp-123",
                )

        calls = fake_instances[0].responses.calls
        self.assertEqual(calls[0]["previous_response_id"], "resp-123")
        self.assertEqual(result["response_id"], "resp-1")

    async def test_generate_retries_without_previous_response_id_when_provider_rejects_it(self):
        class _RejectingPreviousResponseAPI:
            def __init__(self):
                self.calls = []
                self._counter = 0

            async def create(self, **kwargs):
                self.calls.append(kwargs)
                if kwargs.get("previous_response_id"):
                    raise OpenAIError(
                        "Error code: 400 - "
                        "{'error': {'message': 'Unsupported parameter: previous_response_id'}}"
                    )
                self._counter += 1
                return _FakeResponse(
                    response_id=f"resp-{self._counter}",
                    output_text=f"reply #{self._counter}",
                )

        class _RejectingPreviousResponseClient:
            def __init__(self, **kwargs):
                self.responses = _RejectingPreviousResponseAPI()

        with patch("agent.AsyncOpenAI", _RejectingPreviousResponseClient):
            with patch.dict(
                "os.environ",
                {
                    "AGENT_RUNTIME": "responses",
                    "AGENT_API_KEY": "test-key",
                },
                clear=False,
            ):
                client = AgentClient.from_env()
                first = await client.generate("first", "session-1", {})
                second = await client.generate("second", "session-1", {})
                third = await client.generate("third", "session-1", {})

        calls = client._get_sdk_client().responses.calls
        self.assertEqual(first["reply"], "reply #1")
        self.assertEqual(second["reply"], "reply #2")
        self.assertEqual(third["reply"], "reply #3")
        self.assertIsNone(calls[0]["previous_response_id"])
        self.assertEqual(calls[1]["previous_response_id"], "resp-1")
        self.assertNotIn("previous_response_id", calls[2])
        self.assertNotIn("previous_response_id", calls[3])

    async def test_generate_uses_codex_cli_runtime_when_configured(self):
        fake_runners = []

        def _fake_runner_factory(config):
            runner = _FakeCodexRunner(config)
            fake_runners.append(runner)
            return runner

        with patch("agent.CodexRunner", side_effect=_fake_runner_factory):
            with patch.dict(
                "os.environ",
                {
                    "AGENT_RUNTIME": "codex_cli",
                    "AGENT_API_KEY": "test-key",
                    "AGENT_API_BASE_URL": "https://example.invalid/v1",
                    "CODEX_API_KEY": "test-key",
                },
                clear=False,
            ):
                client = AgentClient.from_env()
                result = await client.generate(
                    prompt="run codex path",
                    session_id="session-x",
                    metadata={"channel": "relay"},
                    previous_response_id="resp-prev",
                )

        self.assertEqual(client.runtime, "codex_cli")
        self.assertEqual(len(fake_runners), 1)
        self.assertEqual(len(fake_runners[0].calls), 1)
        self.assertEqual(fake_runners[0].calls[0]["previous_response_id"], "resp-prev")
        self.assertEqual(result["reply"], "codex cli reply")
        self.assertEqual(result["response_id"], "codex-resp-1")

    async def test_generate_uses_opencode_cli_runtime_when_configured(self):
        fake_runners = []

        def _fake_runner_factory(config):
            runner = _FakeOpenCodeRunner(config)
            fake_runners.append(runner)
            return runner

        with patch("agent.OpenCodeRunner", side_effect=_fake_runner_factory):
            with patch.dict(
                "os.environ",
                {
                    "AGENT_RUNTIME": "opencode_cli",
                    "AGENT_API_KIND": "chat_completions",
                    "AGENT_MODEL": "relaychat/test-model",
                    "AGENT_API_KEY": "test-key",
                    "AGENT_API_BASE_URL": "https://example.invalid/v1",
                },
                clear=False,
            ):
                client = AgentClient.from_env()
                result = await client.generate(
                    prompt="run opencode path",
                    session_id="session-z",
                    metadata={"channel": "relay"},
                    previous_response_id="ses-prev",
                )

        self.assertEqual(client.runtime, "opencode_cli")
        self.assertEqual(client.api_kind, "chat_completions")
        self.assertEqual(len(fake_runners), 1)
        self.assertEqual(len(fake_runners[0].calls), 1)
        self.assertEqual(fake_runners[0].calls[0]["previous_response_id"], "ses-prev")
        self.assertEqual(result["reply"], "opencode cli reply")
        self.assertEqual(result["response_id"], "opencode-ses-1")

    async def test_runtime_defaults_to_codex_cli(self):
        with patch.dict("os.environ", {}, clear=True):
            client = AgentClient.from_env()

        self.assertEqual(client.runtime, "codex_cli")

    async def test_generate_falls_back_to_streaming_responses_when_body_text_is_empty(self):
        class _EmptyResponsesAPI:
            def __init__(self):
                self.create_calls = []
                self.stream_calls = []

            async def create(self, **kwargs):
                self.create_calls.append(kwargs)
                return _FakeResponse(response_id="resp-empty", output_text="  ")

            def stream(self, **kwargs):
                self.stream_calls.append(kwargs)
                final_response = _FakeResponse(
                    response_id="resp-streamed",
                    output_text="relay path verified",
                )
                return _FakeStreamContext(
                    _FakeStream(
                        events=[
                            type("Event", (), {"type": "response.output_text.delta", "delta": "relay "})(),
                            type("Event", (), {"type": "response.output_text.delta", "delta": "path verified"})(),
                            type("Event", (), {"type": "response.completed", "response": final_response})(),
                        ],
                        final_response=final_response,
                    )
                )

        class _EmptyAsyncOpenAI:
            def __init__(self, **kwargs):
                self.responses = _EmptyResponsesAPI()

        with patch("agent.AsyncOpenAI", _EmptyAsyncOpenAI):
            client = AgentClient(
                agent_id="hf-space-coder-v1",
                instance_id="test-instance",
                persona_ids=["coder"],
                version="2026-04-18",
                provider="openai",
                runtime="responses",
                model="gpt-5.3-codex",
                api_key="test-key",
                api_base_url="https://api.openai.com/v1",
                api_kind="responses",
                timeout_seconds=30,
                placeholder_enabled=False,
                temperature=0.2,
                store=True,
                system_prompt="test prompt",
            )
            result = await client.generate("prompt", "s1", {})

        self.assertEqual(result["reply"], "relay path verified")

    async def test_poll_once_claims_a_run_and_posts_the_response(self):
        fake_client = _FakeGeneratingClient()
        bridge = RelayBridge(
            agent_client=fake_client,
            relay_ws_url="https://relay.example",
            relay_secret="secret",
            reconnect_seconds=1,
        )
        requests = []

        async def fake_request(method, path, payload=None):
            requests.append((method, path, payload))
            if path == "/v1/worker/claim":
                return {
                    "type": "prompt",
                    "runId": "run-123",
                    "conversationId": "conv-456",
                    "personaId": "coder",
                    "prompt": "write tests please",
                    "sessionId": "conv-456",
                    "continuity": {"previousResponseId": "resp-older"},
                    "metadata": {"client": "android"},
                }
            if path == "/v1/worker/runs/run-123/response":
                return {"ok": True}
            raise AssertionError(f"unexpected path: {path}")

        bridge._request_json = fake_request

        handled = await bridge._poll_once()

        self.assertTrue(handled)
        self.assertEqual(
            fake_client.calls,
            [
                {
                    "prompt": "write tests please",
                    "session_id": "conv-456",
                    "metadata": {"client": "android"},
                    "previous_response_id": "resp-older",
                }
            ],
        )
        self.assertEqual(requests[0][0:2], ("POST", "/v1/worker/claim"))
        self.assertEqual(requests[1][0:2], ("POST", "/v1/worker/runs/run-123/response"))
        self.assertEqual(requests[1][2]["reply"], "protocol reply")

    async def test_poll_once_applies_control_restart_config(self):
        with patch("agent.CodexRunner", side_effect=lambda config: _FakeCodexRunner(config)):
            client = AgentClient(
                agent_id="hf-space-coder-v1",
                instance_id="instance-xyz",
                persona_ids=["coder"],
                version="2026-04-18",
                provider="openai_compatible",
                runtime="codex_cli",
                model="gpt-5.3-codex",
                api_key="old-key",
                api_base_url="https://old.example/v1",
                api_kind="responses",
                timeout_seconds=30,
                placeholder_enabled=False,
                temperature=0.2,
                store=True,
                system_prompt="old prompt",
                enabled_skills=["alpha"],
            )

        bridge = RelayBridge(
            agent_client=client,
            relay_ws_url="https://relay.example",
            relay_secret="secret",
            reconnect_seconds=1,
        )

        async def fake_request(method, path, payload=None):
            if path == "/v1/worker/claim":
                return {
                    "type": "control",
                    "action": "restart",
                    "agentId": "hf-space-coder-v1",
                    "restartGeneration": 3,
                    "config": {
                        "runtime": "codex_cli",
                        "apiKind": "responses",
                        "model": "gpt-5.4",
                        "apiBaseUrl": "https://new.example/v1",
                        "apiKey": "new-key",
                        "systemPrompt": "new prompt",
                        "temperature": 0.4,
                        "store": False,
                        "enabledSkills": ["beta"],
                    },
                }
            raise AssertionError(f"unexpected path: {path}")

        bridge._request_json = fake_request

        with patch("agent.sync_skills", return_value={
            "status": "ok",
            "available_skills": ["alpha", "beta"],
            "enabled_skills": ["beta"],
        }):
            handled = await bridge._poll_once()

        self.assertTrue(handled)
        self.assertEqual(client.model, "gpt-5.4")
        self.assertEqual(client.api_kind, "responses")
        self.assertEqual(client.api_base_url, "https://new.example/v1")
        self.assertEqual(client.api_key, "new-key")
        self.assertEqual(client.system_prompt, "new prompt")
        self.assertEqual(client.enabled_skills, ["beta"])
        self.assertEqual(client.available_skills, ["alpha", "beta"])
        self.assertEqual(client.observed_restart_generation, 3)

    async def test_poll_once_applies_control_restart_config_can_clear_endpoint_and_key(self):
        with patch("agent.CodexRunner", side_effect=lambda config: _FakeCodexRunner(config)):
            client = AgentClient(
                agent_id="hf-space-coder-v1",
                instance_id="instance-xyz",
                persona_ids=["coder"],
                version="2026-04-18",
                provider="openai_compatible",
                runtime="codex_cli",
                model="gpt-5.3-codex",
                api_key="old-key",
                api_base_url="https://old.example/v1",
                api_kind="responses",
                timeout_seconds=30,
                placeholder_enabled=False,
                temperature=0.2,
                store=True,
                system_prompt="old prompt",
                enabled_skills=["alpha"],
            )

        bridge = RelayBridge(
            agent_client=client,
            relay_ws_url="https://relay.example",
            relay_secret="secret",
            reconnect_seconds=1,
        )

        async def fake_request(method, path, payload=None):
            if path == "/v1/worker/claim":
                return {
                    "type": "control",
                    "action": "restart",
                    "agentId": "hf-space-coder-v1",
                    "restartGeneration": 4,
                    "config": {
                        "runtime": "codex_cli",
                        "apiKind": "responses",
                        "model": "gpt-5.4",
                        "apiBaseUrl": "",
                        "apiKey": "",
                        "systemPrompt": "",
                        "temperature": 0.4,
                        "store": False,
                        "enabledSkills": [],
                    },
                }
            raise AssertionError(f"unexpected path: {path}")

        bridge._request_json = fake_request

        with patch("agent.sync_skills", return_value={
            "status": "ok",
            "available_skills": ["alpha", "beta"],
            "enabled_skills": [],
        }):
            handled = await bridge._poll_once()

        self.assertTrue(handled)
        self.assertEqual(client.api_base_url, "")
        self.assertEqual(client.api_key, "")
        self.assertEqual(client.system_prompt, "")
        self.assertEqual(client.enabled_skills, [])
        self.assertEqual(client.observed_restart_generation, 4)

    async def test_relay_prompt_protocol_uses_run_id_persona_and_continuity(self):
        fake_client = _FakeGeneratingClient()
        bridge = RelayBridge(
            agent_client=fake_client,
            relay_ws_url="wss://relay.example/agent",
            relay_secret="secret",
            reconnect_seconds=1,
        )
        websocket = _FakeWebSocket()
        payload = {
            "type": "prompt",
            "runId": "run-123",
            "conversationId": "conv-456",
            "personaId": "coder",
            "prompt": "write tests please",
            "continuity": {"previousResponseId": "resp-older"},
            "metadata": {"client": "android"},
        }

        await bridge._handle_message(websocket, json.dumps(payload))

        self.assertEqual(
            fake_client.calls,
            [
                {
                    "prompt": "write tests please",
                    "session_id": None,
                    "metadata": {"client": "android"},
                    "previous_response_id": "resp-older",
                }
            ],
        )

        self.assertEqual(len(websocket.sent_messages), 1)
        message = json.loads(websocket.sent_messages[0])
        self.assertEqual(message["type"], "response")
        self.assertEqual(message["runId"], "run-123")
        self.assertEqual(message["conversationId"], "conv-456")
        self.assertEqual(message["personaId"], "coder")
        self.assertEqual(message["responseId"], "resp-generated")
        self.assertEqual(message["reply"], "protocol reply")


if __name__ == "__main__":
    unittest.main()
