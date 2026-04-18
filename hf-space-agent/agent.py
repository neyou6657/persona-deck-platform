from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request
import websockets
from openai import AsyncOpenAI, OpenAIError

from codex_runner import CodexRunner, CodexRunnerConfig, CodexRunnerError


logger = logging.getLogger("hf_space_agent")


class AgentError(RuntimeError):
    pass


@dataclass
class AgentClient:
    agent_id: str
    instance_id: str
    persona_ids: list[str]
    version: str
    provider: str
    runtime: str
    model: str
    api_base_url: str
    api_key: str
    api_kind: str
    timeout_seconds: float
    placeholder_enabled: bool
    temperature: float
    store: bool
    system_prompt: str
    _sdk_client: AsyncOpenAI | None = field(default=None, init=False, repr=False)
    _codex_runner: CodexRunner | None = field(default=None, init=False, repr=False)
    _session_response_ids: dict[str, str] = field(default_factory=dict, init=False, repr=False)
    _session_cache_limit: int = field(default=500, init=False, repr=False)
    _responses_supports_previous_response_id: bool = field(default=True, init=False, repr=False)

    @classmethod
    def from_env(cls) -> "AgentClient":
        agent_id = os.getenv("AGENT_ID", "hf-space-agent").strip() or "hf-space-agent"
        instance_id = os.getenv("AGENT_INSTANCE_ID", "").strip() or str(uuid.uuid4())
        persona_ids_raw = os.getenv("AGENT_PERSONA_IDS", os.getenv("AGENT_PERSONA_ID", "default"))
        persona_ids = [item.strip() for item in persona_ids_raw.split(",") if item.strip()]
        if not persona_ids:
            persona_ids = ["default"]
        version = os.getenv("AGENT_VERSION", "2026-04-18").strip() or "2026-04-18"
        provider = os.getenv("AGENT_PROVIDER", "openai_compatible").strip() or "openai_compatible"
        runtime = os.getenv("AGENT_RUNTIME", "codex_cli").strip().lower() or "codex_cli"
        if runtime not in {"responses", "codex_cli"}:
            logger.warning("AGENT_RUNTIME=%s is not supported; forcing 'codex_cli'", runtime)
            runtime = "codex_cli"
        model = os.getenv("AGENT_MODEL", "gpt-5.3-codex").strip() or "gpt-5.3-codex"
        requested_kind = os.getenv("AGENT_API_KIND", "responses").strip() or "responses"
        if requested_kind != "responses":
            logger.warning("AGENT_API_KIND=%s is not supported; forcing 'responses'", requested_kind)
        api_kind = "responses"
        api_base_url = os.getenv("AGENT_API_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
        legacy_api_url = os.getenv("AGENT_API_URL", "").strip().rstrip("/")
        if legacy_api_url:
            if legacy_api_url.endswith("/responses"):
                api_base_url = legacy_api_url[: -len("/responses")]
            elif legacy_api_url.endswith("/chat/completions"):
                api_base_url = legacy_api_url[: -len("/chat/completions")]
            else:
                api_base_url = legacy_api_url

        api_key = os.getenv("AGENT_API_KEY", "").strip()
        timeout_seconds = float(os.getenv("AGENT_TIMEOUT_SECONDS", "120"))
        placeholder_enabled = os.getenv("AGENT_PLACEHOLDER_ENABLED", "false").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        temperature = float(os.getenv("AGENT_TEMPERATURE", "0.2"))
        store = os.getenv("AGENT_STORE", "true").lower() in {"1", "true", "yes", "on"}
        system_prompt = os.getenv(
            "AGENT_SYSTEM_PROMPT",
            "You are Codex, a concise coding agent. Return practical implementation help.",
        ).strip()
        client = cls(
            agent_id=agent_id,
            instance_id=instance_id,
            persona_ids=persona_ids,
            version=version,
            provider=provider,
            runtime=runtime,
            model=model,
            api_base_url=api_base_url,
            api_key=api_key,
            api_kind=api_kind,
            timeout_seconds=timeout_seconds,
            placeholder_enabled=placeholder_enabled,
            temperature=temperature,
            store=store,
            system_prompt=system_prompt,
        )
        if runtime == "codex_cli":
            client._codex_runner = CodexRunner(
                CodexRunnerConfig.from_env(
                    default_model=model,
                    default_api_base_url=api_base_url,
                    default_api_key=api_key,
                    default_timeout_seconds=timeout_seconds,
                )
            )
        return client

    def build_registration_message(self) -> dict[str, Any]:
        return {
            "type": "agent_register",
            "agentId": self.agent_id,
            "instanceId": self.instance_id,
            "personaIds": self.persona_ids,
            "capabilities": {"stream": False, "tools": False},
            "version": self.version,
        }

    async def generate(
        self,
        prompt: str,
        session_id: str | None,
        metadata: dict[str, Any],
        previous_response_id: str | None = None,
    ) -> dict[str, Any]:
        if self.runtime == "codex_cli":
            return await self._call_codex_cli(prompt, session_id, metadata, previous_response_id)
        if self.api_key:
            return await self._call_responses(prompt, session_id, metadata, previous_response_id)
        if self.placeholder_enabled:
            return await self._placeholder(prompt, session_id, metadata)
        raise AgentError("AGENT_API_KEY is not configured and placeholder mode is disabled")

    async def _call_codex_cli(
        self,
        prompt: str,
        session_id: str | None,
        metadata: dict[str, Any],
        previous_response_id: str | None,
    ) -> dict[str, Any]:
        continuity_response_id: str | None = None
        if isinstance(previous_response_id, str) and previous_response_id.strip():
            continuity_response_id = previous_response_id.strip()
        elif session_id:
            continuity_response_id = self._session_response_ids.get(session_id)

        if self._codex_runner is None:
            raise AgentError("AGENT_RUNTIME=codex_cli but codex runner is not initialized")

        try:
            result = await self._codex_runner.run(
                prompt=prompt,
                system_prompt=self.system_prompt,
                session_id=session_id,
                previous_response_id=continuity_response_id,
                metadata=metadata,
            )
        except CodexRunnerError as exc:
            raise AgentError(f"codex cli request failed: {exc}") from exc

        response_id = result.get("response_id")
        if session_id and isinstance(response_id, str) and response_id.strip():
            self._session_response_ids[session_id] = response_id.strip()
            self._trim_session_cache()
        return result

    def _get_sdk_client(self) -> AsyncOpenAI:
        if self._sdk_client is None:
            self._sdk_client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.api_base_url,
                timeout=self.timeout_seconds,
            )
        return self._sdk_client

    async def _call_responses(
        self,
        prompt: str,
        session_id: str | None,
        metadata: dict[str, Any],
        previous_response_id: str | None,
    ) -> dict[str, Any]:
        continuity_response_id: str | None = None
        if isinstance(previous_response_id, str) and previous_response_id.strip():
            continuity_response_id = previous_response_id.strip()
        elif session_id:
            continuity_response_id = self._session_response_ids.get(session_id)
        request_kwargs = {
            "model": self.model,
            "input": prompt,
            "instructions": self.system_prompt,
            "temperature": self.temperature,
            "store": self.store,
        }
        if self._responses_supports_previous_response_id:
            request_kwargs["previous_response_id"] = continuity_response_id

        try:
            response = await self._get_sdk_client().responses.create(**request_kwargs)
        except OpenAIError as exc:
            if continuity_response_id and self._is_unsupported_previous_response_error(exc):
                self._responses_supports_previous_response_id = False
                retry_kwargs = dict(request_kwargs)
                retry_kwargs.pop("previous_response_id", None)
                try:
                    response = await self._get_sdk_client().responses.create(**retry_kwargs)
                except OpenAIError as retry_exc:
                    raise AgentError(f"official OpenAI SDK request failed: {retry_exc}") from retry_exc
            else:
                raise AgentError(f"official OpenAI SDK request failed: {exc}") from exc

        usage = self._extract_usage(response)
        model = getattr(response, "model", self.model) or self.model
        raw = self._extract_raw(response)
        response_id = getattr(response, "id", None)
        try:
            reply = self._extract_reply(response)
        except AgentError:
            streamed = await self._stream_responses(request_kwargs)
            reply = streamed["reply"]
            usage = streamed.get("usage", usage)
            model = streamed.get("model", model)
            raw = streamed.get("raw", raw)
            response_id = streamed.get("response_id", response_id)

        if session_id and isinstance(response_id, str) and response_id.strip():
            self._session_response_ids[session_id] = response_id.strip()
            self._trim_session_cache()

        return {
            "reply": reply,
            "model": model,
            "session_id": session_id,
            "response_id": response_id,
            "usage": usage,
            "raw": raw,
        }

    async def _stream_responses(self, request_kwargs: dict[str, Any]) -> dict[str, Any]:
        collected: list[str] = []
        final_response: Any | None = None

        try:
            async with self._get_sdk_client().responses.stream(**request_kwargs) as stream:
                async for event in stream:
                    event_type = getattr(event, "type", None)
                    if event_type == "response.output_text.delta":
                        delta = getattr(event, "delta", None)
                        if isinstance(delta, str) and delta:
                            collected.append(delta)
                    elif event_type == "response.completed":
                        final_response = getattr(event, "response", None)

                if final_response is None:
                    final_response = await stream.get_final_response()
        except OpenAIError as exc:
            raise AgentError(f"official OpenAI SDK streaming request failed: {exc}") from exc

        reply = "".join(collected).strip()
        if not reply and final_response is not None:
            reply = self._extract_reply(final_response)
        if not reply:
            raise AgentError("official OpenAI SDK streaming response did not include assistant text")

        return {
            "reply": reply,
            "model": getattr(final_response, "model", self.model) or self.model,
            "usage": self._extract_usage(final_response) if final_response is not None else None,
            "raw": self._extract_raw(final_response) if final_response is not None else {"streamed": True},
            "response_id": getattr(final_response, "id", None),
        }

    async def _placeholder(
        self, prompt: str, session_id: str | None, metadata: dict[str, Any]
    ) -> dict[str, Any]:
        await asyncio.sleep(0)
        metadata_hint = ""
        if metadata:
            keys = ", ".join(sorted(metadata.keys())[:5])
            metadata_hint = f" Metadata keys: {keys}."
        preview = prompt.replace("\n", " ").strip()
        if len(preview) > 180:
            preview = preview[:177] + "..."
        reply = (
            "Placeholder mode: AGENT_API_KEY is not set, so no external model call was made. "
            f"Prompt preview: {preview}.{metadata_hint}"
        )
        return {
            "reply": reply,
            "model": f"{self.provider}:placeholder",
            "session_id": session_id,
            "response_id": None,
            "usage": {"input_chars": len(prompt), "placeholder": True},
            "raw": {"placeholder": True},
        }

    @staticmethod
    def _extract_reply(response: Any) -> str:
        output_text = getattr(response, "output_text", None)
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()

        payload = AgentClient._extract_raw(response)
        output = payload.get("output")
        if isinstance(output, list):
            collected: list[str] = []
            for item in output:
                if not isinstance(item, dict):
                    continue
                content = item.get("content")
                if not isinstance(content, list):
                    continue
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        collected.append(text.strip())
            if collected:
                return "\n".join(collected).strip()

        raise AgentError("official OpenAI SDK response did not include assistant text")

    @staticmethod
    def _extract_usage(response: Any) -> dict[str, Any] | None:
        usage = getattr(response, "usage", None)
        if usage is None:
            return None
        if isinstance(usage, dict):
            return usage
        model_dump = getattr(usage, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump()
            if isinstance(dumped, dict):
                return dumped
        return None

    @staticmethod
    def _extract_raw(response: Any) -> dict[str, Any]:
        model_dump = getattr(response, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump()
            if isinstance(dumped, dict):
                return dumped
        return {"raw_type": type(response).__name__}

    def _trim_session_cache(self) -> None:
        while len(self._session_response_ids) > self._session_cache_limit:
            oldest_key = next(iter(self._session_response_ids))
            del self._session_response_ids[oldest_key]

    @staticmethod
    def _is_unsupported_previous_response_error(error: OpenAIError) -> bool:
        message = str(error).lower()
        return "previous_response_id" in message and "unsupported" in message

@dataclass
class RelayBridge:
    agent_client: AgentClient
    relay_ws_url: str
    relay_secret: str
    reconnect_seconds: float
    connected: bool = False
    last_error: str | None = None
    last_poll_at: str | None = None
    last_claimed_run_id: str | None = None

    @classmethod
    def from_env(cls, agent_client: AgentClient) -> "RelayBridge":
        return cls(
            agent_client=agent_client,
            relay_ws_url=os.getenv("DENO_AGENT_WS_URL", "").strip(),
            relay_secret=os.getenv("DENO_AGENT_SHARED_SECRET", "").strip(),
            reconnect_seconds=float(os.getenv("DENO_RECONNECT_SECONDS", "5")),
        )

    def health(self) -> dict[str, Any]:
        return {
            "relay_ws_url": self.relay_ws_url,
            "relay_http_url": self._relay_http_base_url(),
            "relay_transport": "worker_poll",
            "relay_configured": bool(self.relay_ws_url and self.relay_secret),
            "relay_connected": self.connected,
            "last_error": self.last_error,
            "last_poll_at": self.last_poll_at,
            "last_claimed_run_id": self.last_claimed_run_id,
        }

    async def run_forever(self) -> None:
        while True:
            if not self.relay_ws_url or not self.relay_secret:
                self.connected = False
                self.last_error = "DENO_AGENT_WS_URL or DENO_AGENT_SHARED_SECRET is missing"
                await asyncio.sleep(self.reconnect_seconds)
                continue

            try:
                handled = await self._poll_once()
                self.connected = True
                self.last_error = None
                await asyncio.sleep(0.25 if handled else self.reconnect_seconds)
            except asyncio.CancelledError:
                self.connected = False
                raise
            except Exception as exc:  # noqa: BLE001
                self.connected = False
                self.last_error = str(exc)
                logger.warning("Relay connection dropped: %s", exc)
                await asyncio.sleep(self.reconnect_seconds)

    def _relay_http_base_url(self) -> str:
        base_url = self.relay_ws_url.strip()
        if base_url.startswith("wss://"):
            base_url = "https://" + base_url[len("wss://"):]
        elif base_url.startswith("ws://"):
            base_url = "http://" + base_url[len("ws://"):]
        if base_url.endswith("/agent"):
            base_url = base_url[: -len("/agent")]
        return base_url.rstrip("/")

    def _worker_registration_payload(self) -> dict[str, Any]:
        if hasattr(self.agent_client, "build_registration_message"):
            registration = self.agent_client.build_registration_message()
            return {
                "agentId": registration["agentId"],
                "instanceId": registration["instanceId"],
                "personaIds": registration["personaIds"],
                "capabilities": registration.get("capabilities", {}),
                "version": registration.get("version"),
            }
        return {
            "agentId": getattr(self.agent_client, "agent_id", "hf-space-agent"),
            "instanceId": getattr(self.agent_client, "instance_id", "test-instance"),
            "personaIds": getattr(self.agent_client, "persona_ids", ["default"]),
            "capabilities": {"stream": False, "tools": False},
            "version": getattr(self.agent_client, "version", None),
        }

    async def _request_json(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        url = f"{self._relay_http_base_url()}{path}"
        headers = {"Authorization": f"Bearer {self.relay_secret}"}
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode("utf-8")

        def _run() -> dict[str, Any] | None:
            request = urllib_request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib_request.urlopen(request, timeout=self.agent_client.timeout_seconds) as response:
                    body = response.read()
                    if response.status == 204 or not body:
                        return None
                    return json.loads(body.decode("utf-8"))
            except urllib_error.HTTPError as exc:
                if exc.code == 204:
                    return None
                error_body = exc.read().decode("utf-8", errors="replace")
                raise AgentError(
                    f"relay {method} {path} failed with {exc.code}: {error_body or exc.reason}"
                ) from exc

        return await asyncio.to_thread(_run)

    async def _poll_once(self) -> bool:
        claim = await self._request_json(
            "POST",
            "/v1/worker/claim",
            self._worker_registration_payload(),
        )
        self.last_poll_at = datetime.now(timezone.utc).isoformat()
        if not isinstance(claim, dict) or claim.get("type") != "prompt":
            return False
        run_id = claim.get("runId")
        self.last_claimed_run_id = run_id if isinstance(run_id, str) else None
        await self._process_claimed_prompt(claim)
        return True

    async def _process_claimed_prompt(self, payload: dict[str, Any]) -> None:
        run_id = payload.get("runId")
        prompt = payload.get("prompt")
        conversation_id = payload.get("conversationId")
        persona_id = payload.get("personaId")
        session_id = payload.get("sessionId")
        metadata = payload.get("metadata")
        instance_id = getattr(self.agent_client, "instance_id", "test-instance")
        continuity = payload.get("continuity")
        previous_response_id = (
            continuity.get("previousResponseId")
            if isinstance(continuity, dict)
            and isinstance(continuity.get("previousResponseId"), str)
            and continuity.get("previousResponseId")
            else None
        )

        if not isinstance(run_id, str) or not run_id:
            logger.warning("Ignoring claimed run without runId")
            return
        if not isinstance(prompt, str) or not prompt.strip():
            await self._request_json(
                "POST",
                f"/v1/worker/runs/{run_id}/error",
                {
                    "instanceId": instance_id,
                    "conversationId": conversation_id if isinstance(conversation_id, str) else None,
                    "personaId": persona_id if isinstance(persona_id, str) else None,
                    "error": "prompt must be a non-empty string",
                },
            )
            return

        try:
            result = await self.agent_client.generate(
                prompt=prompt.strip(),
                session_id=session_id if isinstance(session_id, str) else None,
                metadata=metadata if isinstance(metadata, dict) else {},
                previous_response_id=previous_response_id,
            )
            await self._request_json(
                "POST",
                f"/v1/worker/runs/{run_id}/response",
                {
                    "instanceId": instance_id,
                    "conversationId": conversation_id if isinstance(conversation_id, str) else None,
                    "personaId": persona_id if isinstance(persona_id, str) else None,
                    "responseId": result.get("response_id"),
                    "reply": result["reply"],
                    "sessionId": result.get("session_id"),
                    "model": result.get("model"),
                    "usage": result.get("usage"),
                    "raw": result.get("raw"),
                },
            )
        except AgentError as exc:
            await self._request_json(
                "POST",
                f"/v1/worker/runs/{run_id}/error",
                {
                    "instanceId": instance_id,
                    "conversationId": conversation_id if isinstance(conversation_id, str) else None,
                    "personaId": persona_id if isinstance(persona_id, str) else None,
                    "error": str(exc),
                },
            )

    async def _handle_message(self, websocket: Any, raw_message: str) -> None:
        try:
            payload = json.loads(raw_message)
        except json.JSONDecodeError:
            logger.warning("Ignoring non-JSON relay message")
            return

        if not isinstance(payload, dict):
            return
        if payload.get("type") != "prompt":
            return

        run_id = payload.get("runId")
        request_id = payload.get("requestId")
        if not isinstance(run_id, str) or not run_id:
            run_id = request_id if isinstance(request_id, str) and request_id else None
        prompt = payload.get("prompt")
        conversation_id = payload.get("conversationId")
        persona_id = payload.get("personaId")
        session_id = payload.get("sessionId")
        metadata = payload.get("metadata")
        continuity = payload.get("continuity")
        previous_response_id = (
            continuity.get("previousResponseId")
            if isinstance(continuity, dict)
            and isinstance(continuity.get("previousResponseId"), str)
            and continuity.get("previousResponseId")
            else None
        )

        if not isinstance(run_id, str) or not run_id:
            logger.warning("Ignoring prompt without runId")
            return
        if not isinstance(prompt, str) or not prompt.strip():
            await websocket.send(
                json.dumps(
                    {
                        "type": "error",
                        "runId": run_id,
                        "conversationId": conversation_id if isinstance(conversation_id, str) else None,
                        "personaId": persona_id if isinstance(persona_id, str) else None,
                        "error": "prompt must be a non-empty string",
                    }
                )
            )
            return

        try:
            result = await self.agent_client.generate(
                prompt=prompt.strip(),
                session_id=session_id if isinstance(session_id, str) else None,
                metadata=metadata if isinstance(metadata, dict) else {},
                previous_response_id=previous_response_id,
            )
            await websocket.send(
                json.dumps(
                    {
                        "type": "response",
                        "runId": run_id,
                        "conversationId": conversation_id if isinstance(conversation_id, str) else None,
                        "personaId": persona_id if isinstance(persona_id, str) else None,
                        "responseId": result.get("response_id"),
                        "reply": result["reply"],
                        "sessionId": result.get("session_id"),
                        "model": result.get("model"),
                        "usage": result.get("usage"),
                        "raw": result.get("raw"),
                    }
                )
            )
        except AgentError as exc:
            await websocket.send(
                json.dumps(
                    {
                        "type": "error",
                        "runId": run_id,
                        "conversationId": conversation_id if isinstance(conversation_id, str) else None,
                        "personaId": persona_id if isinstance(persona_id, str) else None,
                        "error": str(exc),
                    }
                )
            )
