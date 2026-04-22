from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class CodexRunnerError(RuntimeError):
    pass


@dataclass
class CodexRunnerConfig:
    codex_bin: str
    workdir: str
    codex_home: str
    model: str
    model_provider: str
    provider_name: str
    api_base_url: str
    api_key: str
    timeout_seconds: float

    @classmethod
    def from_env(
        cls,
        default_model: str,
        default_api_base_url: str,
        default_api_key: str,
        default_timeout_seconds: float,
    ) -> "CodexRunnerConfig":
        return cls(
            codex_bin=os.getenv("CODEX_BIN", "codex").strip() or "codex",
            workdir=os.getenv("CODEX_WORKDIR", "/tmp").strip() or "/tmp",
            codex_home=os.getenv("CODEX_HOME", str(Path.home() / ".codex")).strip() or str(Path.home() / ".codex"),
            model=os.getenv("CODEX_MODEL", default_model).strip() or default_model,
            model_provider=os.getenv("CODEX_MODEL_PROVIDER", "relaygw").strip() or "relaygw",
            provider_name=os.getenv("CODEX_PROVIDER_NAME", "Relay Gateway").strip() or "Relay Gateway",
            api_base_url=os.getenv("CODEX_API_BASE_URL", default_api_base_url).strip().rstrip("/"),
            api_key=os.getenv("CODEX_API_KEY", default_api_key).strip() or default_api_key,
            timeout_seconds=float(os.getenv("CODEX_TIMEOUT_SECONDS", str(default_timeout_seconds))),
        )

    @classmethod
    def from_runtime(
        cls,
        model: str,
        api_base_url: str,
        api_key: str,
        timeout_seconds: float,
    ) -> "CodexRunnerConfig":
        return cls(
            codex_bin=os.getenv("CODEX_BIN", "codex").strip() or "codex",
            workdir=os.getenv("CODEX_WORKDIR", "/tmp").strip() or "/tmp",
            codex_home=os.getenv("CODEX_HOME", str(Path.home() / ".codex")).strip() or str(Path.home() / ".codex"),
            model=model,
            model_provider=os.getenv("CODEX_MODEL_PROVIDER", "relaygw").strip() or "relaygw",
            provider_name=os.getenv("CODEX_PROVIDER_NAME", "Relay Gateway").strip() or "Relay Gateway",
            api_base_url=api_base_url.strip().rstrip("/"),
            api_key=api_key.strip(),
            timeout_seconds=timeout_seconds,
        )


def _escape_toml(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


class CodexRunner:
    def __init__(self, config: CodexRunnerConfig):
        self.config = config
        self._session_threads: dict[str, str] = {}

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        session_id: str | None,
        previous_response_id: str | None,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        self._ensure_provider_files()
        full_prompt = self._build_prompt(
            prompt=prompt,
            system_prompt=system_prompt,
            session_id=session_id,
            previous_response_id=previous_response_id,
            metadata=metadata,
        )
        thread_id = self._resolve_thread_id(session_id, previous_response_id)
        cmd = self._build_command(thread_id)

        env = os.environ.copy()
        env["CODEX_HOME"] = self.config.codex_home
        if self.config.api_key:
            env["OPENAI_API_KEY"] = self.config.api_key

        process = None
        stdout = b""
        stderr = b""
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=self.config.workdir,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(input=full_prompt.encode("utf-8")),
                timeout=self.config.timeout_seconds,
            )
        except FileNotFoundError as exc:
            raise CodexRunnerError(f"codex binary not found: {self.config.codex_bin}") from exc
        except asyncio.TimeoutError as exc:
            raise CodexRunnerError("codex exec timed out") from exc

        if process is None or process.returncode != 0:
            stderr_text = stderr.decode("utf-8", errors="ignore").strip()
            stdout_text = stdout.decode("utf-8", errors="ignore").strip()
            code = process.returncode if process is not None else "unknown"
            raise CodexRunnerError(stderr_text or stdout_text or f"codex exited with {code}")

        parsed = self._parse_exec_jsonl(
            stdout.decode("utf-8", errors="ignore"),
            fallback_thread_id=thread_id,
        )
        reply = parsed["reply"]
        if not reply:
            raise CodexRunnerError("codex returned empty output")
        response_id = parsed["thread_id"]
        if session_id and response_id:
            self._session_threads[session_id] = response_id

        return {
            "reply": reply,
            "model": self.config.model,
            "session_id": session_id,
            "response_id": response_id,
            "usage": None,
            "raw": {
                "runtime": "codex_cli",
                "events": parsed["events"],
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

    def _resolve_thread_id(
        self,
        session_id: str | None,
        previous_response_id: str | None,
    ) -> str | None:
        if session_id:
            cached = self._session_threads.get(session_id)
            if cached:
                return cached
        if isinstance(previous_response_id, str) and previous_response_id.strip():
            return previous_response_id.strip()
        return None

    def _build_command(self, thread_id: str | None) -> list[str]:
        base = [
            self.config.codex_bin,
            "exec",
        ]
        if thread_id:
            base.append("resume")
        base.append("--skip-git-repo-check")
        if not thread_id:
            base.extend([
                "--sandbox",
                "danger-full-access",
            ])
        base.extend([
            "--model",
            self.config.model,
            "-c",
            f'model_provider="{_escape_toml(self.config.model_provider)}"',
        ])
        if thread_id:
            base.extend([thread_id, "--json", "-"])
        else:
            base.extend(["--json", "--cd", self.config.workdir, "-"])
        return base

    def _ensure_provider_files(self) -> None:
        home = Path(self.config.codex_home)
        home.mkdir(parents=True, exist_ok=True)
        self._write_provider_config(home)
        self._write_auth_config(home)

    def _write_provider_config(self, home: Path) -> None:
        cfg_path = home / "config.toml"
        existing = cfg_path.read_text(encoding="utf-8") if cfg_path.exists() else ""
        section = self._build_provider_section()
        updated = self._upsert_provider_section(existing, section)
        cfg_path.write_text(updated, encoding="utf-8")

    def _write_auth_config(self, home: Path) -> None:
        if not self.config.api_key:
            return
        auth_path = home / "auth.json"
        payload = {
            "OPENAI_API_KEY": self.config.api_key,
            "auth_mode": "apikey",
        }
        auth_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        os.chmod(auth_path, 0o600)

    def _build_provider_section(self) -> str:
        lines = [
            f"[model_providers.{self.config.model_provider}]",
            f'name = "{_escape_toml(self.config.provider_name)}"',
        ]
        if self.config.api_base_url:
            lines.append(f'base_url = "{_escape_toml(self.config.api_base_url)}"')
        lines.extend([
            'env_key = "OPENAI_API_KEY"',
            'wire_api = "responses"',
            "",
        ])
        return "\n".join(lines)

    def _upsert_provider_section(self, content: str, section: str) -> str:
        header = f"[model_providers.{self.config.model_provider}]"
        subsection_prefix = f"[model_providers.{self.config.model_provider}."
        if header not in content:
            trimmed = content.rstrip()
            return f"{trimmed}\n\n{section}".strip() + "\n"

        lines = content.splitlines()
        kept: list[str] = []
        skipping = False
        inserted = False
        for line in lines:
            stripped = line.strip()
            if stripped == header:
                if not inserted:
                    kept.extend(section.rstrip().splitlines())
                    inserted = True
                skipping = True
                continue
            if skipping and stripped.startswith("[") and stripped != header and not stripped.startswith(subsection_prefix):
                skipping = False
            if not skipping:
                kept.append(line)
        if not inserted:
            kept.extend(["", *section.rstrip().splitlines()])
        return "\n".join(kept).strip() + "\n"

    def _parse_exec_jsonl(self, raw_output: str, fallback_thread_id: str | None) -> dict[str, Any]:
        thread_id = fallback_thread_id
        reply_parts: list[str] = []
        events: list[dict[str, Any]] = []
        for line in raw_output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict):
                continue
            events.append(event)
            event_type = event.get("type")
            if event_type == "thread.started" and isinstance(event.get("thread_id"), str):
                thread_id = event["thread_id"].strip() or thread_id
                continue
            if event_type == "turn.failed":
                error = event.get("error")
                if isinstance(error, dict) and isinstance(error.get("message"), str):
                    raise CodexRunnerError(error["message"])
                raise CodexRunnerError("codex turn failed")
            if event_type != "item.completed":
                continue
            item = event.get("item")
            if not isinstance(item, dict):
                continue
            if item.get("type") not in {"agent_message", "message"}:
                continue
            text = self._extract_item_text(item)
            if text:
                reply_parts.append(text)
        return {
            "thread_id": thread_id,
            "reply": "\n".join(reply_parts).strip(),
            "events": events,
        }

    def _extract_item_text(self, item: dict[str, Any]) -> str:
        for key in ("output_text", "content", "text"):
            text = self._flatten_text(item.get(key))
            if text:
                return text
        return ""

    def _flatten_text(self, value: Any) -> str:
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, list):
            parts = [self._flatten_text(item) for item in value]
            return "\n".join([part for part in parts if part]).strip()
        if isinstance(value, dict):
            for key in ("text", "content", "output_text"):
                text = self._flatten_text(value.get(key))
                if text:
                    return text
        return ""
