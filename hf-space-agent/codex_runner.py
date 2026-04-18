from __future__ import annotations

import asyncio
import os
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class CodexRunnerError(RuntimeError):
    pass


@dataclass
class CodexRunnerConfig:
    codex_bin: str
    workdir: str
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
            model=os.getenv("CODEX_MODEL", default_model).strip() or default_model,
            model_provider=os.getenv("CODEX_MODEL_PROVIDER", "relaygw").strip() or "relaygw",
            provider_name=os.getenv("CODEX_PROVIDER_NAME", "Relay Gateway").strip() or "Relay Gateway",
            api_base_url=os.getenv("CODEX_API_BASE_URL", default_api_base_url).strip().rstrip("/"),
            api_key=os.getenv("CODEX_API_KEY", default_api_key).strip() or default_api_key,
            timeout_seconds=float(os.getenv("CODEX_TIMEOUT_SECONDS", str(default_timeout_seconds))),
        )


def _escape_toml(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


class CodexRunner:
    def __init__(self, config: CodexRunnerConfig):
        self.config = config

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        session_id: str | None,
        previous_response_id: str | None,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        full_prompt = self._build_prompt(
            prompt=prompt,
            system_prompt=system_prompt,
            session_id=session_id,
            previous_response_id=previous_response_id,
            metadata=metadata,
        )
        with tempfile.NamedTemporaryFile(prefix="codex-last-", suffix=".txt", delete=False) as handle:
            output_path = Path(handle.name)

        cmd = [
            self.config.codex_bin,
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "danger-full-access",
            "--ask-for-approval",
            "never",
            "--cd",
            self.config.workdir,
            "-m",
            self.config.model,
            "-o",
            str(output_path),
            "-c",
            f'model_provider="{_escape_toml(self.config.model_provider)}"',
            "-c",
            f'model_providers.{self.config.model_provider}.name="{_escape_toml(self.config.provider_name)}"',
            "-c",
            f'model_providers.{self.config.model_provider}.base_url="{_escape_toml(self.config.api_base_url)}"',
            "-c",
            f'model_providers.{self.config.model_provider}.wire_api="responses"',
            "-c",
            f'model_providers.{self.config.model_provider}.env_key="CODEX_RUNTIME_API_KEY"',
            full_prompt,
        ]

        env = os.environ.copy()
        if self.config.api_key:
            env["CODEX_RUNTIME_API_KEY"] = self.config.api_key

        process = None
        stdout = b""
        stderr = b""
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self.config.timeout_seconds)
        except FileNotFoundError as exc:
            raise CodexRunnerError(f"codex binary not found: {self.config.codex_bin}") from exc
        except asyncio.TimeoutError as exc:
            raise CodexRunnerError("codex exec timed out") from exc

        if process is None or process.returncode != 0:
            stderr_text = stderr.decode("utf-8", errors="ignore").strip()
            stdout_text = stdout.decode("utf-8", errors="ignore").strip()
            code = process.returncode if process is not None else "unknown"
            output_path.unlink(missing_ok=True)
            raise CodexRunnerError(stderr_text or stdout_text or f"codex exited with {code}")

        reply = ""
        if output_path.exists():
            reply = output_path.read_text(encoding="utf-8", errors="ignore").strip()
            output_path.unlink(missing_ok=True)
        if not reply:
            raise CodexRunnerError("codex returned empty output")

        response_id = f"codex-{uuid.uuid4()}"
        return {
            "reply": reply,
            "model": self.config.model,
            "session_id": session_id,
            "response_id": response_id,
            "usage": None,
            "raw": {"runtime": "codex_cli"},
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
