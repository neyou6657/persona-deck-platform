from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class OpenCodeRunnerError(RuntimeError):
    pass


def _default_opencode_bin() -> str:
    installed = Path.home() / ".opencode" / "bin" / "opencode"
    return str(installed) if installed.exists() else "opencode"


@dataclass
class OpenCodeRunnerConfig:
    opencode_bin: str
    workdir: str
    opencode_home: str
    model: str
    provider_name: str
    api_base_url: str
    api_key: str
    timeout_seconds: float

    @classmethod
    def from_runtime(
        cls,
        model: str,
        api_base_url: str,
        api_key: str,
        timeout_seconds: float,
    ) -> "OpenCodeRunnerConfig":
        default_home = str(Path.home() / ".opencode-relay")
        return cls(
            opencode_bin=os.getenv("OPENCODE_BIN", _default_opencode_bin()).strip() or _default_opencode_bin(),
            workdir=os.getenv("OPENCODE_WORKDIR", "/tmp").strip() or "/tmp",
            opencode_home=os.getenv("OPENCODE_HOME", default_home).strip() or default_home,
            model=model.strip(),
            provider_name=os.getenv("OPENCODE_PROVIDER_NAME", "Relay Chat").strip() or "Relay Chat",
            api_base_url=api_base_url.strip().rstrip("/"),
            api_key=api_key.strip(),
            timeout_seconds=timeout_seconds,
        )


class OpenCodeRunner:
    def __init__(self, config: OpenCodeRunnerConfig):
        self.config = config
        self._session_ids: dict[str, str] = {}

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        session_id: str | None,
        previous_response_id: str | None,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        if not self.config.model:
            raise OpenCodeRunnerError("opencode model is not configured")
        if not self.config.api_base_url:
            raise OpenCodeRunnerError("opencode api base url is not configured")

        workdir = Path(self.config.workdir)
        workdir.mkdir(parents=True, exist_ok=True)
        self._ensure_opencode_config(workdir)

        continuation_session_id = self._resolve_session_id(session_id, previous_response_id)
        full_prompt = self._build_prompt(
            prompt=prompt,
            system_prompt=system_prompt,
            session_id=session_id,
            previous_response_id=continuation_session_id,
            metadata=metadata,
        )
        cmd = self._build_command(full_prompt, continuation_session_id)
        env = self._build_env()

        process = None
        stdout = b""
        stderr = b""
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(workdir),
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.config.timeout_seconds,
            )
        except FileNotFoundError as exc:
            raise OpenCodeRunnerError(f"opencode binary not found: {self.config.opencode_bin}") from exc
        except asyncio.TimeoutError as exc:
            raise OpenCodeRunnerError("opencode exec timed out") from exc

        stdout_text = stdout.decode("utf-8", errors="ignore")
        stderr_text = stderr.decode("utf-8", errors="ignore").strip()
        if process is None or process.returncode != 0:
            code = process.returncode if process is not None else "unknown"
            raise OpenCodeRunnerError(stderr_text or stdout_text.strip() or f"opencode exited with {code}")

        resolved_session_id, events = self._parse_json_events(
            stdout_text,
            fallback_session_id=continuation_session_id,
        )
        if session_id and resolved_session_id:
            self._session_ids[session_id] = resolved_session_id

        exported_session = None
        reply = ""
        usage = None
        if resolved_session_id:
            exported_session = await self._export_session(
                session_id=resolved_session_id,
                env=env,
                cwd=str(workdir),
            )
            reply = self._extract_reply_from_export(exported_session)
            usage = self._extract_usage_from_export(exported_session)

        if not reply:
            reply = self._extract_reply_from_events(events)
        if not reply:
            raise OpenCodeRunnerError("opencode returned empty output")

        return {
            "reply": reply,
            "model": self.config.model,
            "session_id": session_id,
            "response_id": resolved_session_id,
            "usage": usage,
            "raw": {
                "runtime": "opencode_cli",
                "events": events,
                "session": exported_session,
            },
        }

    @staticmethod
    def _build_prompt(
        prompt: str,
        system_prompt: str,
        session_id: str | None,
        previous_response_id: str | None,
        metadata: dict[str, Any],
    ) -> str:
        lines = [
            "You are running as a relay-connected coding agent.",
            "",
            "System instructions:",
            system_prompt,
            "",
        ]
        if session_id:
            lines.append(f"Session ID: {session_id}")
        if previous_response_id:
            lines.append(f"Previous response ID: {previous_response_id}")
        if metadata:
            lines.append(f"Metadata: {metadata}")
        lines.extend(["", "User prompt:", prompt.strip()])
        return "\n".join(lines).strip()

    def _resolve_session_id(
        self,
        session_id: str | None,
        previous_response_id: str | None,
    ) -> str | None:
        if session_id:
            cached = self._session_ids.get(session_id)
            if cached:
                return cached
        if isinstance(previous_response_id, str) and previous_response_id.strip():
            return previous_response_id.strip()
        return None

    def _build_command(self, prompt: str, continuation_session_id: str | None) -> list[str]:
        model_selector = self._model_selector()
        cmd = [
            self.config.opencode_bin,
            "run",
            "--format",
            "json",
            "--model",
            model_selector,
            "--dir",
            self.config.workdir,
            "--dangerously-skip-permissions",
        ]
        if continuation_session_id:
            cmd.extend(["--session", continuation_session_id])
        cmd.append(prompt)
        return cmd

    def _build_env(self) -> dict[str, str]:
        home = Path(self.config.opencode_home)
        env = os.environ.copy()
        env["HOME"] = str(home)
        env["XDG_CONFIG_HOME"] = str(home / ".config")
        env["XDG_DATA_HOME"] = str(home / ".local" / "share")
        env["XDG_STATE_HOME"] = str(home / ".local" / "state")
        env["XDG_CACHE_HOME"] = str(home / ".cache")
        if self.config.api_key:
            env["OPENCODE_API_KEY"] = self.config.api_key
        return env

    def _ensure_opencode_config(self, workdir: Path) -> None:
        home = Path(self.config.opencode_home)
        home.mkdir(parents=True, exist_ok=True)
        (home / ".config").mkdir(parents=True, exist_ok=True)
        (home / ".local" / "share").mkdir(parents=True, exist_ok=True)
        (home / ".local" / "state").mkdir(parents=True, exist_ok=True)
        (home / ".cache").mkdir(parents=True, exist_ok=True)

        provider_id, model_id = self._split_model()
        options: dict[str, Any] = {
            "baseURL": self.config.api_base_url,
        }
        if self.config.api_key:
            options["apiKey"] = "{env:OPENCODE_API_KEY}"
        payload = {
            "$schema": "https://opencode.ai/config.json",
            "provider": {
                provider_id: {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": self.config.provider_name,
                    "options": options,
                    "models": {
                        model_id: {
                            "id": model_id,
                            "name": model_id,
                            "release_date": "2026-01-01",
                        }
                    },
                }
            },
        }
        config_path = workdir / "opencode.json"
        config_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def _split_model(self) -> tuple[str, str]:
        raw_model = self.config.model.strip()
        if "/" in raw_model:
            provider_id, model_id = raw_model.split("/", 1)
            provider_id = provider_id.strip() or "relaychat"
            model_id = model_id.strip() or raw_model
            return provider_id, model_id
        provider_id = os.getenv("OPENCODE_PROVIDER_ID", "relaychat").strip() or "relaychat"
        return provider_id, raw_model

    def _model_selector(self) -> str:
        provider_id, model_id = self._split_model()
        return f"{provider_id}/{model_id}"

    @staticmethod
    def _parse_json_events(
        raw_output: str,
        fallback_session_id: str | None,
    ) -> tuple[str | None, list[dict[str, Any]]]:
        session_id = fallback_session_id
        events: list[dict[str, Any]] = []
        for line in raw_output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            events.append(payload)
            resolved = payload.get("sessionID")
            if isinstance(resolved, str) and resolved.strip():
                session_id = resolved.strip()
        return session_id, events

    async def _export_session(
        self,
        session_id: str,
        env: dict[str, str],
        cwd: str,
    ) -> dict[str, Any] | None:
        process = None
        stdout = b""
        stderr = b""
        try:
            process = await asyncio.create_subprocess_exec(
                self.config.opencode_bin,
                "export",
                session_id,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.config.timeout_seconds,
            )
        except FileNotFoundError as exc:
            raise OpenCodeRunnerError(f"opencode binary not found: {self.config.opencode_bin}") from exc
        except asyncio.TimeoutError as exc:
            raise OpenCodeRunnerError("opencode export timed out") from exc

        stdout_text = stdout.decode("utf-8", errors="ignore").strip()
        stderr_text = stderr.decode("utf-8", errors="ignore").strip()
        if process is None or process.returncode != 0:
            code = process.returncode if process is not None else "unknown"
            raise OpenCodeRunnerError(stderr_text or stdout_text or f"opencode export exited with {code}")
        if not stdout_text:
            return None
        try:
            payload = json.loads(stdout_text)
        except json.JSONDecodeError as exc:
            raise OpenCodeRunnerError("opencode export returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise OpenCodeRunnerError("opencode export returned unexpected payload")
        return payload

    @classmethod
    def _extract_reply_from_export(cls, payload: dict[str, Any] | None) -> str:
        if not isinstance(payload, dict):
            return ""
        messages = payload.get("messages")
        if not isinstance(messages, list):
            return ""
        for message in reversed(messages):
            if not isinstance(message, dict):
                continue
            info = message.get("info")
            if not isinstance(info, dict) or info.get("role") != "assistant":
                continue
            parts = message.get("parts")
            if not isinstance(parts, list):
                continue
            fragments = cls._collect_text_fragments(parts)
            if fragments:
                return "\n".join(fragments).strip()
        return ""

    @staticmethod
    def _extract_usage_from_export(payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if not isinstance(payload, dict):
            return None
        messages = payload.get("messages")
        if not isinstance(messages, list):
            return None
        for message in reversed(messages):
            if not isinstance(message, dict):
                continue
            info = message.get("info")
            if not isinstance(info, dict) or info.get("role") != "assistant":
                continue
            tokens = info.get("tokens")
            return tokens if isinstance(tokens, dict) else None
        return None

    @classmethod
    def _extract_reply_from_events(cls, events: list[dict[str, Any]]) -> str:
        fragments: list[str] = []
        for event in events:
            part = event.get("part")
            if isinstance(part, dict):
                fragments.extend(cls._collect_text_fragments([part]))
        return "\n".join(fragment for fragment in fragments if fragment).strip()

    @classmethod
    def _collect_text_fragments(cls, values: list[Any]) -> list[str]:
        fragments: list[str] = []
        for value in values:
            if isinstance(value, list):
                fragments.extend(cls._collect_text_fragments(value))
                continue
            if not isinstance(value, dict):
                continue
            part_type = value.get("type")
            text = value.get("text")
            if part_type in {None, "text", "output_text", "message"} and isinstance(text, str) and text.strip():
                fragments.append(text.strip())
            delta = value.get("delta")
            if isinstance(delta, str) and delta.strip():
                fragments.append(delta.strip())
            for key in ("parts", "content", "items"):
                nested = value.get(key)
                if isinstance(nested, list):
                    fragments.extend(cls._collect_text_fragments(nested))
        return fragments
