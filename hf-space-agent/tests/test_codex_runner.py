import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from codex_runner import CodexRunner, CodexRunnerConfig


class _FakeProcess:
    def __init__(self, stdout_payload: bytes, returncode: int = 0, stderr_payload: bytes = b""):
        self.stdout_payload = stdout_payload
        self.stderr_payload = stderr_payload
        self.returncode = returncode
        self.last_input = None

    async def communicate(self, input=None):
        self.last_input = input
        return self.stdout_payload, self.stderr_payload


class CodexRunnerTest(unittest.IsolatedAsyncioTestCase):
    def test_build_command_avoids_unsupported_approval_flag(self):
        runner = CodexRunner(
            CodexRunnerConfig(
                codex_bin="codex",
                workdir="/tmp",
                codex_home="/tmp/.codex",
                model="gpt-5.3-codex",
                model_provider="relaygw",
                provider_name="Relay Gateway",
                api_base_url="https://example.invalid/v1",
                api_key="test-key",
                timeout_seconds=30,
            )
        )

        first_turn = runner._build_command(thread_id=None)
        resumed_turn = runner._build_command(thread_id="thread-1")

        self.assertNotIn("--ask-for-approval", first_turn)
        self.assertNotIn("--ask-for-approval", resumed_turn)
        self.assertIn("--sandbox", first_turn)
        self.assertIn("danger-full-access", first_turn)
        self.assertNotIn("--sandbox", resumed_turn)

    async def test_run_uses_thread_id_for_resume_continuity(self):
        created = []

        async def _fake_exec(*args, **kwargs):
            call_index = len(created)
            stdout_payload = [
                b'{"type":"thread.started","thread_id":"thread-1"}\n'
                b'{"type":"item.completed","item":{"type":"message","content":[{"text":"first reply"}]}}\n'
                b'{"type":"turn.completed"}\n',
                b'{"type":"item.completed","item":{"type":"message","content":[{"text":"second reply"}]}}\n'
                b'{"type":"turn.completed"}\n',
            ][call_index]
            process = _FakeProcess(stdout_payload=stdout_payload)
            created.append((args, kwargs, process))
            return process

        with tempfile.TemporaryDirectory() as tmpdir:
            runner = CodexRunner(
                CodexRunnerConfig(
                    codex_bin="codex",
                    workdir=tmpdir,
                    codex_home=str(Path(tmpdir) / ".codex"),
                    model="gpt-5.3-codex",
                    model_provider="relaygw",
                    provider_name="Relay Gateway",
                    api_base_url="https://example.invalid/v1",
                    api_key="test-key",
                    timeout_seconds=30,
                )
            )
            with patch("codex_runner.asyncio.create_subprocess_exec", side_effect=_fake_exec):
                first = await runner.run(
                    prompt="first prompt",
                    system_prompt="be useful",
                    session_id="conv-1",
                    previous_response_id=None,
                    metadata={"source": "test"},
                )
                second = await runner.run(
                    prompt="second prompt",
                    system_prompt="be useful",
                    session_id="conv-1",
                    previous_response_id=None,
                    metadata={},
                )

        self.assertEqual(first["reply"], "first reply")
        self.assertEqual(first["response_id"], "thread-1")
        self.assertEqual(second["reply"], "second reply")
        self.assertEqual(second["response_id"], "thread-1")
        self.assertIn("exec", created[0][0])
        self.assertNotIn("resume", created[0][0])
        self.assertIn("resume", created[1][0])
        self.assertIn("thread-1", created[1][0])
        self.assertIn(b"first prompt", created[0][2].last_input)
        self.assertIn(b"second prompt", created[1][2].last_input)
        self.assertEqual(created[0][1]["stdin"], asyncio.subprocess.PIPE)
        self.assertEqual(created[1][1]["stdin"], asyncio.subprocess.PIPE)

    async def test_run_uses_explicit_previous_response_id_as_resume_thread(self):
        created = []

        async def _fake_exec(*args, **kwargs):
            process = _FakeProcess(
                stdout_payload=
                b'{"type":"item.completed","item":{"type":"message","content":[{"text":"reply"}]}}\n'
                b'{"type":"turn.completed"}\n'
            )
            created.append((args, kwargs, process))
            return process

        with tempfile.TemporaryDirectory() as tmpdir:
            runner = CodexRunner(
                CodexRunnerConfig(
                    codex_bin="codex",
                    workdir=tmpdir,
                    codex_home=str(Path(tmpdir) / ".codex"),
                    model="gpt-5.3-codex",
                    model_provider="relaygw",
                    provider_name="Relay Gateway",
                    api_base_url="https://example.invalid/v1",
                    api_key="test-key",
                    timeout_seconds=30,
                )
            )
            with patch("codex_runner.asyncio.create_subprocess_exec", side_effect=_fake_exec):
                result = await runner.run(
                    prompt="resume me",
                    system_prompt="be useful",
                    session_id="conv-x",
                    previous_response_id="thread-prev",
                    metadata={},
                )

        self.assertEqual(result["response_id"], "thread-prev")
        self.assertIn("resume", created[0][0])
        self.assertIn("thread-prev", created[0][0])

    async def test_run_parses_agent_message_text_field(self):
        async def _fake_exec(*args, **kwargs):
            return _FakeProcess(
                stdout_payload=
                b'{"type":"thread.started","thread_id":"thread-1"}\n'
                b'{"type":"item.completed","item":{"type":"agent_message","text":"plain text reply"}}\n'
                b'{"type":"turn.completed"}\n'
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            runner = CodexRunner(
                CodexRunnerConfig(
                    codex_bin="codex",
                    workdir=tmpdir,
                    codex_home=str(Path(tmpdir) / ".codex"),
                    model="gpt-5.3-codex",
                    model_provider="relaygw",
                    provider_name="Relay Gateway",
                    api_base_url="https://example.invalid/v1",
                    api_key="test-key",
                    timeout_seconds=30,
                )
            )
            with patch("codex_runner.asyncio.create_subprocess_exec", side_effect=_fake_exec):
                result = await runner.run(
                    prompt="plain text please",
                    system_prompt="be useful",
                    session_id="conv-plain",
                    previous_response_id=None,
                    metadata={},
                )

        self.assertEqual(result["reply"], "plain text reply")
        self.assertEqual(result["response_id"], "thread-1")


if __name__ == "__main__":
    unittest.main()
